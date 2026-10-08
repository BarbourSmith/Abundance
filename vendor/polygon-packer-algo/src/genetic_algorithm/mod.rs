//! # Genetic Algorithm Module
//!
//! Implementation of genetic algorithms for optimizing polygon placement.
//! This module provides evolutionary optimization techniques to find
//! efficient arrangements of polygons within bins.

mod genetic_algorithm;
mod phenotype;

pub use genetic_algorithm::GeneticAlgorithm;
pub use phenotype::Phenotype;
