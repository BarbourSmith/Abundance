import React from "react";
import { GUIDE_CLIPS } from "../../js/guideClips.js";
import "../../styles/featured.css";

const HERO_CLIP = GUIDE_CLIPS[0];

/** Every item of every section, for finding the hero's actions by value. */
const findItem = (sections, value) =>
  sections
    .flatMap((section) => section.value || [])
    .find((item) => item?.value === value);

/** What opening an item does: open its link, or run its onClick. */
const openItem = (item) =>
  item.url ? window.open(item.url, "_blank") : item.onClick?.();

/**
 * The Getting started tab, styled like the Featured tab: a "Start here" panel
 * with the basics tutorial and user guide, then one shelf per section
 * (tutorials, videos, help).
 *
 * @param {{label: string, value: object[]}[]} sections - The tab's sections;
 *   items have a label, a thumbnail, and either a url or an onClick
 */
export default function GettingStartedShowcase({ sections }) {
  if (!Array.isArray(sections)) return null;
  const basics = findItem(sections, "gettingStarted");
  const guide = findItem(sections, "userGuide");

  return (
    <div className="featured-showcase">
      <section className="featured-spotlight" aria-label="Start here">
        <div className="getting-started-clip">
          <img src={HERO_CLIP.src} alt={HERO_CLIP.alt} />
        </div>
        <div className="featured-spotlight-info">
          <p className="featured-eyebrow">Start here</p>
          <h2>New to Abundance?</h2>
          <p className="featured-description">
            Learn the canvas, build your first part and share it. Each tutorial
            opens a small project and walks you through it step by step.
          </p>
          <div className="featured-actions">
            {basics ? (
              <button
                type="button"
                className="featured-button featured-button-primary"
                onClick={() => openItem(basics)}
              >
                Start the basics tutorial
              </button>
            ) : null}
            {guide ? (
              <button
                type="button"
                className="featured-button featured-button-outline"
                onClick={() => openItem(guide)}
              >
                Read the user guide
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {sections.map((section) => (
        <section
          key={section.label}
          className="featured-shelf"
          aria-label={section.label}
        >
          <h3>{section.label}</h3>
          <ul className="featured-shelf-row">
            {(section.value || []).map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  className="featured-card"
                  onClick={() => openItem(item)}
                >
                  {item.thumbnail ? <img src={item.thumbnail} alt="" /> : null}
                  <span className="featured-card-name">{item.label}</span>
                  {item.url ? (
                    <span className="featured-card-owner">
                      Video on YouTube
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
