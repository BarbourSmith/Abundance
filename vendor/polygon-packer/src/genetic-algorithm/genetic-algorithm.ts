import { PolygonF32 } from 'geometry-utils';

import { BoundRectF32, NestConfig, PolygonNode } from '../types';
import Phenotype from './phenotype';
export default class GeneticAlgorithm {
    #binBounds: BoundRectF32;

    #population: Phenotype[] = [];

    #isEmpty: boolean = true;

    #rotations: number = 0;

    #trashold: number = 0;

    #angleCandidates: Map<number, { fitting: number[]; compact: number[] }> = new Map();

    public init(nodes: PolygonNode[], bounds: BoundRectF32, config: NestConfig): void {
        if (!this.#isEmpty) {
            return;
        }

        this.#rotations = config.rotations;
        this.#trashold = 0.01 * config.mutationRate;
        this.#isEmpty = false;
        this.#binBounds = bounds;

        // initiate new GA
        const polygon: PolygonF32 = new PolygonF32();
        const adam: PolygonNode[] = nodes.slice();
        let areaA: number = 0;
        let areaB: number = 0;

        adam.sort((a, b) => {
            polygon.bind(a.memSeg);

            areaA = polygon.absArea;

            polygon.bind(b.memSeg);

            areaB = polygon.absArea;

            return areaB - areaA;
        });
        // population is an array of individuals. Each individual is a object representing the
        // order of insertion and the angle each part is rotated
        const angles: number[] = [];
        let i: number = 0;
        let mutant: Phenotype = null;

        for (i = 0; i < adam.length; ++i) {
            angles.push(this.randomAngle(polygon, adam[i]));
        }

        this.#population.push(new Phenotype(adam, angles));

        while (this.#population.length < config.populationSize) {
            mutant = this.mutate(this.#population[0]);
            this.#population.push(mutant);
        }
    }
    public clean(): void {
        this.#isEmpty = true;
        this.#rotations = 0;
        this.#trashold = 0;
        this.#binBounds = null;
        this.#population.length = 0;
        this.#angleCandidates.clear();
    }

    // returns a mutated individual with the given mutation rate
    private mutate(individual: Phenotype): Phenotype {
        const polygon: PolygonF32 = new PolygonF32();
        const clone: Phenotype = individual.clone();
        const size: number = clone.size;
        let i: number = 0;

        for (i = 0; i < size; ++i) {
            if (this.getMutate()) {
                clone.swap(i);
            }

            if (this.getMutate()) {
                clone.rotation[i] = this.randomAngle(polygon, clone.placement[i]);
            }
        }

        return clone;
    }

    // single point crossover
    private mate(male: Phenotype, female: Phenotype): Phenotype[] {
        const cutPoint: number = male.cutPoint;
        const result: Phenotype[] = [male.cut(cutPoint), female.cut(cutPoint)];

        result[0].mate(female);
        result[1].mate(male);

        return result;
    }

    // returns a random individual from the population, weighted to the front of the list (lower
    // fitness value is more likely to be selected)
    private randomWeightedIndividual(exclude?: Phenotype): Phenotype {
        const excludeIndex: number = exclude ? this.#population.indexOf(exclude) : -1;
        const localPopulation: Phenotype[] = this.#population.slice();

        if (excludeIndex !== -1) {
            localPopulation.splice(excludeIndex, 1);
        }

        const size: number = localPopulation.length;
        const rand: number = Math.random();
        const weight: number = 2 / size;
        let lower: number = 0;
        let upper: number = weight / 2;
        let i: number = 0;

        for (i = 0; i < size; ++i) {
            // if the random number falls between lower and upper bounds, select this individual
            if (rand > lower && rand < upper) {
                return localPopulation[i];
            }

            lower = upper;
            upper = upper + weight * ((size - i) / size);
        }

        return localPopulation[0];
    }

    // returns a random angle of insertion
    private randomAngle(polygon: PolygonF32, node: PolygonNode): number {
        const { fitting, compact } = this.candidateAngles(polygon, node);

        if (fitting.length === 0) {
            return 0;
        }

        // Usually pick one of the angles that give the part its smallest bounding box.
        // Those pack best, especially for the rectangular parts that make up most
        // sheet-goods projects; picking uniformly from every angle meant the search
        // spent most of its time on layouts full of parts sitting at 30 degrees. The
        // rest of the time any angle is fair game, so odd shapes still get explored.
        const pool: number[] = Math.random() < GeneticAlgorithm.COMPACT_ANGLE_BIAS ? compact : fitting;

        return pool[Math.floor(Math.random() * pool.length)];
    }

    // Angles at which the part fits in the bin, and the subset of those whose rotated
    // bounding box is (within 1%) the smallest. Cached per part, since it only depends
    // on the part's outline and the rotation count.
    private candidateAngles(polygon: PolygonF32, node: PolygonNode): { fitting: number[]; compact: number[] } {
        const cached = this.#angleCandidates.get(node.source);

        if (cached !== undefined) {
            return cached;
        }

        const step: number = 360 / this.#rotations;
        const fitting: number[] = [];
        const areas: number[] = [];
        let angle: number = 0;
        let i: number = 0;

        for (i = 0; i < this.#rotations; ++i) {
            angle = Math.round(i * step);
            polygon.bind(node.memSeg.slice());
            polygon.rotate(angle);

            // don't use obviously bad angles where the part doesn't fit in the bin
            if (polygon.size.x < this.#binBounds.width && polygon.size.y < this.#binBounds.height) {
                fitting.push(angle);
                areas.push(polygon.size.x * polygon.size.y);
            }
        }

        const minArea: number = Math.min(...areas);
        const compact: number[] = fitting.filter((_, index) => areas[index] <= minArea * 1.01);
        const result = { fitting, compact };

        this.#angleCandidates.set(node.source, result);

        return result;
    }

    private static COMPACT_ANGLE_BIAS: number = 0.8;

    public get individual(): Phenotype {
        const populationSize: number = this.#population.length;
        let i: number = 0;

        // evaluate all members of the population
        for (i = 0; i < populationSize; ++i) {
            if (!this.#population[i].fitness) {
                return this.#population[i];
            }
        }

        // all individuals have been evaluated, start next generation
        // Individuals with higher fitness are more likely to be selected for mating
        this.#population.sort((a, b) => a.fitness - b.fitness);

        // fittest individual is preserved in the new generation (elitism)
        const result: Phenotype[] = [this.#population[0]];
        const currentSize: number = this.#population.length;
        let male: Phenotype = null;
        let female: Phenotype = null;
        let children: Phenotype[] = null;

        while (result.length < currentSize) {
            male = this.randomWeightedIndividual();
            female = this.randomWeightedIndividual(male);

            // each mating produces two children
            children = this.mate(male, female);

            // slightly mutate children
            result.push(this.mutate(children[0]));

            if (result.length < currentSize) {
                result.push(this.mutate(children[1]));
            }
        }

        this.#population = result;

        return this.#population[1];
    }

    private getMutate(): boolean {
        return Math.random() < this.#trashold;
    }
}
