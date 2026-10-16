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

/**
 * The red heart and like score the project cards show (the feed's userRanking),
 * when the featured feed has the project.
 */
function Stats({ node }) {
  if (!node) return null;
  const score = Math.round(Number(node.userRanking) || 0);
  return (
    <span className="featured-stats" title="Likes">
      <svg
        className="featured-heart"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      <span className="featured-sr-only">Likes: </span>
      {score}
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

/**
 * Image addresses to try for a project's thumbnail, in order. Many feed records
 * still point at a "master" branch that no longer exists, so the current
 * branch's project.png and the older project.svg are tried too.
 */
function thumbnailCandidates(item) {
  const main = `https://raw.githubusercontent.com/${item.owner}/${item.repoName}/main`;
  return [
    ...new Set(
      [
        item.node?.pngURL,
        featuredImageUrl(item),
        item.node?.svgURL,
        `${main}/project.svg`,
      ].filter(Boolean),
    ),
  ];
}

/** One project on a shelf. Calls onGone if none of its thumbnails load. */
function ShelfCard({ item, onGone }) {
  const navigate = useNavigate();
  const candidates = useMemo(() => thumbnailCandidates(item), [item]);
  const [attempt, setAttempt] = useState(0);
  if (attempt >= candidates.length) return null;
  const name = displayName(item.repoName);

  const tryNext = () => {
    if (attempt + 1 >= candidates.length) onGone();
    setAttempt(attempt + 1);
  };

  return (
    <li>
      <button
        type="button"
        className="featured-card"
        onClick={() => navigate(runPath(item))}
      >
        <img
          src={candidates[attempt]}
          alt=""
          loading="lazy"
          onError={tryNext}
        />
        <span className="featured-card-name">{name}</span>
        <span className="featured-card-owner">{item.owner}</span>
        <Stats node={item.node} />
      </button>
    </li>
  );
}

/** A themed row of projects. Hidden once none of its cards can show. */
function Shelf({ shelf }) {
  const [gone, setGone] = useState(() => new Set());
  if (gone.size >= shelf.items.length) return null;
  return (
    <section className="featured-shelf" aria-labelledby={`shelf-${shelf.id}`}>
      <h3 id={`shelf-${shelf.id}`}>{shelf.title}</h3>
      <ul className="featured-shelf-row">
        {shelf.items.map((item) => {
          const key = `${item.owner}/${item.repoName}`;
          return (
            <ShelfCard
              key={key}
              item={item}
              onGone={() => setGone((prev) => new Set(prev).add(key))}
            />
          );
        })}
      </ul>
    </section>
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
        <Shelf key={shelf.id} shelf={shelf} />
      ))}
    </div>
  );
}
