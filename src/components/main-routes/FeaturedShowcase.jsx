import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import FeaturedModelViewer from "../render/FeaturedModelViewer.jsx";
import { featuredImageUrl, featuredModelUrl } from "../../js/featuredModels.js";
import {
  SPOTLIGHT_PROJECTS,
  buildShelves,
  displayName,
  weeklySpotlightIndex,
} from "../../js/featuredShelves.js";
import "../../styles/featured.css";

const runPath = ({ owner, repoName }) => `/run/${owner}/${repoName}`;

/** A project's likes and forks, when the featured feed has them. */
function Stats({ node }) {
  if (!node) return null;
  return (
    <span className="featured-stats">
      {node.likes || 0} {node.likes === 1 ? "like" : "likes"} ·{" "}
      {node.forks || 0} {node.forks === 1 ? "fork" : "forks"}
    </span>
  );
}

/** The week's spotlight: a rotating 3D model with the project's details. */
function Spotlight({ nodesByKey }) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(weeklySpotlightIndex);
  const project = SPOTLIGHT_PROJECTS[index];
  const node = nodesByKey.get(`${project.owner}/${project.repoName}`);
  const name = displayName(project.repoName);

  return (
    <section className="featured-spotlight" aria-label="Spotlight project">
      <div className="featured-spotlight-model">
        <FeaturedModelViewer
          url={featuredModelUrl(project)}
          fallbackImage={featuredImageUrl(project)}
          alt={`Rotating 3D model of ${name}`}
        />
      </div>
      <div className="featured-spotlight-info">
        <p className="featured-eyebrow">Spotlight</p>
        <h2>{name}</h2>
        <p className="featured-owner">by {project.owner}</p>
        {node?.description ? (
          <p className="featured-description">{node.description}</p>
        ) : null}
        <Stats node={node} />
        <div className="featured-actions">
          <button
            type="button"
            className="featured-button featured-button-primary"
            onClick={() => navigate(runPath(project))}
          >
            Open project
          </button>
          <button
            type="button"
            className="featured-button featured-button-outline"
            onClick={() => setIndex((index + 1) % SPOTLIGHT_PROJECTS.length)}
          >
            Show another
          </button>
        </div>
      </div>
    </section>
  );
}

/** One project on a shelf. Hidden if its thumbnail can't load. */
function ShelfCard({ item }) {
  const navigate = useNavigate();
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  const name = displayName(item.repoName);
  const image =
    item.node?.pngURL || item.node?.svgURL || featuredImageUrl(item);

  return (
    <li>
      <button
        type="button"
        className="featured-card"
        onClick={() => navigate(runPath(item))}
      >
        <img
          src={image}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
        />
        <span className="featured-card-name">{name}</span>
        <span className="featured-card-owner">{item.owner}</span>
        <Stats node={item.node} />
      </button>
    </li>
  );
}

/**
 * The Featured tab: a spotlight project, then themed shelves of projects.
 * Uses the projects the tab already loads from the featured feed.
 *
 * @param {object[]} featured - Projects from the featured feed
 */
export default function FeaturedShowcase({ featured }) {
  const shelves = useMemo(() => buildShelves(featured), [featured]);
  const nodesByKey = useMemo(
    () =>
      new Map(featured.map((node) => [`${node.owner}/${node.repoName}`, node])),
    [featured],
  );

  return (
    <div className="featured-showcase">
      <Spotlight nodesByKey={nodesByKey} />
      {shelves.map((shelf) => (
        <section
          key={shelf.id}
          className="featured-shelf"
          aria-labelledby={`shelf-${shelf.id}`}
        >
          <h3 id={`shelf-${shelf.id}`}>{shelf.title}</h3>
          <ul className="featured-shelf-row">
            {shelf.items.map((item) => (
              <ShelfCard key={`${item.owner}/${item.repoName}`} item={item} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
