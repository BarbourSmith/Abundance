import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/index.js";
import FeaturedModelViewer, {
  preloadFeaturedModel,
} from "../render/FeaturedModelViewer.jsx";
import {
  FEATURED_MODELS,
  featuredImageUrl,
  featuredModelUrl,
} from "../../js/featuredModels.js";
import "../../styles/landing.css";

/** How long each featured model is shown before moving to the next. */
const FEATURED_ROTATION_MS = 12000;
/** Below this width the 3D model isn't shown (see landing.css). */
const WIDE_SCREEN_QUERY = "(min-width: 768px)";

/**
 * A model chosen with ?featured=<owner>_<repoName>, for checking a model
 * while curating. It needn't be in FEATURED_MODELS yet.
 */
function pinnedFeaturedModel() {
  const name = new URLSearchParams(window.location.search).get("featured");
  const split = name?.indexOf("_") ?? -1;
  // GitHub usernames can't contain underscores, so the first one ends it
  return split > 0
    ? { owner: name.slice(0, split), repoName: name.slice(split + 1) }
    : null;
}

/** A copy of items in random order (Fisher-Yates). */
function shuffled(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Cycle through the featured models in a new random order on each visit.
 * Pauses while paused is true, so a model the user is orbiting doesn't get
 * swapped out.
 */
function useFeaturedModel(paused) {
  const [pinned] = useState(pinnedFeaturedModel);
  const [order] = useState(() => shuffled(FEATURED_MODELS));
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (pinned || paused || order.length < 2) return;
    const timer = setInterval(
      () => setIndex((i) => (i + 1) % order.length),
      FEATURED_ROTATION_MS,
    );
    return () => clearInterval(timer);
  }, [pinned, paused, order]);
  const next = order[(index + 1) % order.length];
  useEffect(() => {
    preloadFeaturedModel(featuredModelUrl(next));
  }, [next]);
  return pinned || order[index];
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  );
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** The features shown as atoms wired into the model, in order. */
const FEATURES = [
  {
    name: "Parametric",
    detail: "Change one dimension, the design updates",
    icon: (
      <g strokeLinecap="round">
        <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="10" cy="17" r="2" />
      </g>
    ),
  },
  {
    name: "Reusable",
    detail: "Drop anyone's design into yours",
    icon: (
      <g strokeLinejoin="round">
        <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
        <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
      </g>
    ),
  },
  {
    name: "Ready to make",
    detail: "STL, STEP, SVG, G-code, cut lists",
    icon: (
      <path
        d="M12 4v11M7 10l5 5 5-5M5 20h14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    name: "Yours on GitHub",
    detail: "Full history, ready to fork",
    icon: (
      <g strokeLinecap="round">
        <circle cx="6" cy="5" r="2" />
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="8" r="2" />
        <path d="M6 7v10M18 10c0 4-6 3-11.5 7" />
      </g>
    ),
  },
  {
    name: "Works with AI",
    detail: "Build designs with an agent like Claude",
    icon: (
      <g strokeLinejoin="round">
        <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
        <path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8z" />
      </g>
    ),
  },
];

/** The user guide's feature recordings, with the guide section each explains. */
const GUIDE_CLIPS = [
  {
    src: "/videos/runmode_small.mp4",
    alt: "Changing a seat's height and width in run mode",
    title: "Share a project anyone can resize",
    section: "run-mode",
  },
  {
    src: "/videos/ai_small.mp4",
    alt: "Turning a sketch into a design with an AI agent",
    title: "Go from a sketch to a model with AI",
    section: "working-with-an-ai-agent",
  },
  {
    src: "/videos/gcode_small.mp4",
    alt: "Generating CNC toolpaths",
    title: "Send it to your CNC with built-in CAM",
    section: "gcode",
  },
];

const REPO_URL = "https://github.com/BarbourSmith/Abundance";

/** Footer links that leave the site, grouped under a heading each. */
const FOOTER_GROUPS = [
  {
    title: "Get involved",
    links: [
      { label: "Contribute on GitHub", href: REPO_URL },
      { label: "Report a bug", href: `${REPO_URL}/issues/new` },
      {
        label: "Community forum",
        href: "https://forums.maslowcnc.com/c/software-issues/abundance/41",
      },
    ],
  },
  {
    title: "Maslow CNC",
    links: [
      {
        label: "Find out more at maslowcnc.com",
        href: "https://www.maslowcnc.com",
      },
      { label: "About us", href: "https://www.maslowcnc.com/the-team" },
      { label: "Contact", href: "https://www.maslowcnc.com/contact-us" },
    ],
  },
];

/** A link to another site, announced as opening a new tab. */
const ExternalLink = ({ href, className, children }) => (
  <a
    href={href}
    className={className}
    target="_blank"
    rel="noopener noreferrer"
  >
    {children}
    <span className="landing-sr-only"> (opens in a new tab)</span>
  </a>
);

const GitHubMark = () => (
  <svg
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 16 16"
    fill="currentColor"
  >
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

/**
 * The landing page: a dark hero drawn like an Abundance flow, where each
 * feature is an atom wired into the rotating featured model, then the user
 * guide's feature recordings below the fold.
 */
const InitialLog = ({ setNoUserBrowsing }) => {
  const { authRedirectHandler } = useAuth();
  const [interacting, setInteracting] = useState(false);
  const project = useFeaturedModel(interacting);
  const wideScreen = useMediaQuery(WIDE_SCREEN_QUERY);
  const projectName = `${project.owner}/${project.repoName}`;
  const clipsRef = useRef(null);

  return (
    <div className="landing">
      <div className="landing-hero">
        <header className="landing-header">
          <div className="landing-brand">
            <img
              src={
                import.meta.env.VITE_APP_PATH_FOR_PICS +
                "/imgs/abundance_logo.png"
              }
              alt=""
            />
            <span>Abundance</span>
          </div>
          <nav className="landing-nav" aria-label="Main">
            <Link to="/user-guide" className="landing-nav-link">
              User guide
            </Link>
            <ExternalLink
              href="https://github.com/signup"
              className="landing-button landing-button-outline"
            >
              Sign up for GitHub
            </ExternalLink>
            <button
              type="button"
              id="loginButton"
              className="landing-button landing-button-login"
              onClick={() => authRedirectHandler()}
            >
              <GitHubMark />
              Log in with GitHub
            </button>
          </nav>
        </header>

        <div className="landing-main">
          <div className="landing-flow">
            <h1 className="landing-title">
              Design it. Share it.
              <br />
              Make it.
            </h1>
            <div className="landing-intro">
              <p>
                Abundance is free, open source CAD in your browser. Every design
                is a graph of simple steps: change any one of them and the part
                rebuilds. Share it, and anyone can remix it.
              </p>
            </div>

            <ul className="landing-atoms" aria-label="Features">
              {FEATURES.map((feature) => (
                <li key={feature.name} className="landing-atom">
                  <div>
                    <strong>{feature.name}</strong>
                    <span>{feature.detail}</span>
                  </div>
                  <span className="landing-node" aria-hidden="true">
                    <svg
                      width="26"
                      height="26"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      {feature.icon}
                    </svg>
                  </span>
                </li>
              ))}
            </ul>

            <div className="landing-wires" aria-hidden="true">
              <svg viewBox="0 0 280 500" preserveAspectRatio="none">
                {[50, 150, 250, 350, 450].map((y) => (
                  <path key={y} d={`M0 ${y} C 60 ${y}, 50 250, 104 250`} />
                ))}
                <path d="M160 250 L 236 250" />
              </svg>
              <span className="landing-node landing-assembly">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                >
                  <rect x="4" y="9" width="10" height="10" rx="1" />
                  <rect x="10" y="5" width="10" height="10" rx="1" />
                </svg>
              </span>
              <span className="landing-wire-label landing-assembly-label">
                Assembly
              </span>
              <span className="landing-output" />
              <span className="landing-wire-label landing-output-label">
                Output
              </span>
            </div>

            <div className="landing-model">
              <div className="landing-model-view">
                {wideScreen && (
                  <FeaturedModelViewer
                    url={featuredModelUrl(project)}
                    fallbackImage={featuredImageUrl(project)}
                    alt={`Rotating 3D model of ${projectName}, made in Abundance`}
                    onInteractingChange={setInteracting}
                  />
                )}
              </div>
              <button
                type="button"
                id="browseNonGit"
                className="landing-button landing-button-primary"
                onClick={() => setNoUserBrowsing(true)}
              >
                Explore the library
              </button>
            </div>
          </div>

          <button
            type="button"
            className="landing-more"
            onClick={() =>
              clipsRef.current?.scrollIntoView({ behavior: "smooth" })
            }
          >
            See it working
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      <section
        className="landing-clips"
        ref={clipsRef}
        aria-labelledby="landing-clips-title"
      >
        <h2 id="landing-clips-title">See it working</h2>
        <div className="landing-clip-grid">
          {GUIDE_CLIPS.map((clip) => (
            <Link
              key={clip.section}
              to={`/user-guide#${clip.section}`}
              className="landing-clip"
            >
              <video
                src={clip.src}
                aria-label={clip.alt}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
              <span>{clip.title}</span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-about">
            <p className="landing-footer-name">Abundance</p>
            <p>
              Free, open source CAD for designs you can share and remix, made by
              the Maslow CNC team.
            </p>
          </div>
          <nav
            className="landing-footer-group"
            aria-labelledby="landing-footer-abundance"
          >
            <h2 id="landing-footer-abundance">Abundance</h2>
            <ul>
              <li>
                <Link to="/user-guide">User guide</Link>
              </li>
              <li>
                <button
                  type="button"
                  className="landing-footer-link"
                  onClick={() => setNoUserBrowsing(true)}
                >
                  Explore the library
                </button>
              </li>
            </ul>
          </nav>
          {FOOTER_GROUPS.map((group) => {
            const id = `landing-footer-${group.title.toLowerCase().replace(/\W+/g, "-")}`;
            return (
              <nav
                key={group.title}
                className="landing-footer-group"
                aria-labelledby={id}
              >
                <h2 id={id}>{group.title}</h2>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <ExternalLink href={link.href}>{link.label}</ExternalLink>
                    </li>
                  ))}
                </ul>
              </nav>
            );
          })}
        </div>
        <p className="landing-footer-legal">
          Abundance is free software, released under the{" "}
          <ExternalLink href={`${REPO_URL}/blob/main/LICENSE`}>
            GNU GPL v3
          </ExternalLink>
          .
        </p>
      </footer>
    </div>
  );
};

export default InitialLog;
