import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { agentBridge } from "../../agent/bridgeClient.js";
import GlobalVariables from "../../js/globalvariables.js";
import { useAppState } from "../../contexts/AppStateContext.jsx";
import { useDevSettings } from "../../contexts/DevSettingsContext.jsx";
import { version as appVersion } from "../../../package.json";
import "../../styles/DevSettingsModal.css";
import "../../styles/AgentBridge.css";

// Must match AGENT_SELECT_EVENT in src/agent/runtime.js. Duplicated so the
// runtime module stays lazily loaded.
const AGENT_SELECT_EVENT = "abundance-agent-select";
const OPEN_DIALOG_EVENT = "abundance-open-agent-dialog";
/** Adding this to any Abundance URL opens the Connect an AI agent dialog. */
export const AGENT_LINK_HASH = "#agent";

/** Open the Connect an AI agent dialog from anywhere (menus, buttons). */
export function openAgentDialog() {
  window.dispatchEvent(new CustomEvent(OPEN_DIALOG_EVENT));
}

/** Sparkle icon used for the AI agent button and menu entry. */
export function AgentIcon({ size = 20, color = "#c4a3d5" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M11 2L12.9 8.1L19 10L12.9 11.9L11 18L9.1 11.9L3 10L9.1 8.1Z"
        fill={color}
      />
      <path
        d="M18.5 14L19.4 16.6L22 17.5L19.4 18.4L18.5 21L17.6 18.4L15 17.5L17.6 16.6Z"
        fill={color}
        opacity="0.7"
      />
    </svg>
  );
}

function currentProject() {
  const node = GlobalVariables.currentAWSnode;
  if (!node?.owner) return null;
  return { owner: node.owner, repo: node.repoName };
}

export function useAgentBridgeState() {
  return useSyncExternalStore(agentBridge.subscribe, agentBridge.getState);
}

function statusText(state) {
  switch (state.status) {
    case "connected":
      return state.mode === "edit"
        ? "AI agent connected, can edit"
        : "AI agent connected, read-only";
    case "connecting":
      return "AI agent: connecting…";
    case "error":
      return `AI agent: ${state.error || "not connected"}`;
    default:
      return "AI agent off";
  }
}

/**
 * Mounted once in the app shell. Starts the bridge client, relays agent
 * selection requests into React state, opens Developer Settings with
 * Ctrl/Cmd+Shift+D on every page, shows the Connect an AI agent dialog (from
 * menus or an #agent link), and shows the status chip.
 */
export function AgentBridgeHost() {
  const state = useAgentBridgeState();
  const { setActiveAtom } = useAppState();
  const { openDevSettings } = useDevSettings();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const open = () => setDialogOpen(true);
    // An #agent link opens the dialog, then the hash is dropped so a reload
    // or shared URL doesn't keep reopening it.
    const checkHash = () => {
      if (window.location.hash === AGENT_LINK_HASH) {
        setDialogOpen(true);
        window.history.replaceState(
          window.history.state,
          "",
          window.location.pathname + window.location.search,
        );
      }
    };
    checkHash();
    window.addEventListener(OPEN_DIALOG_EVENT, open);
    window.addEventListener("hashchange", checkHash);
    return () => {
      window.removeEventListener(OPEN_DIALOG_EVENT, open);
      window.removeEventListener("hashchange", checkHash);
    };
  }, []);

  useEffect(() => {
    agentBridge.getProject = currentProject;
    agentBridge.appVersion = appVersion;
    agentBridge.start();
    // Handy for debugging from the console; holds no secrets beyond the token
    // the user pasted into this same page.
    window._agentBridge = agentBridge;
  }, []);

  useEffect(() => {
    const onSelect = (e) => {
      if (e.detail?.atom) setActiveAtom(e.detail.atom);
    };
    window.addEventListener(AGENT_SELECT_EVENT, onSelect);
    return () => window.removeEventListener(AGENT_SELECT_EVENT, onSelect);
  }, [setActiveAtom]);

  useEffect(() => {
    const onKey = (e) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key === "D" || e.key === "d")
      ) {
        // Firefox and Chrome bind this to "bookmark all tabs"; keep the
        // browser from also doing that.
        e.preventDefault();
        openDevSettings();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openDevSettings]);

  return (
    <>
      {dialogOpen && <AgentBridgeDialog onClose={() => setDialogOpen(false)} />}
      {state.settings.enabled && <AgentBridgeChip state={state} />}
    </>
  );
}

/** Standalone dialog for pairing, reachable without developer shortcuts. */
function AgentBridgeDialog({ onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="dev-settings-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dev-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-dialog-title"
      >
        <div className="dev-settings-header">
          <h2 id="agent-dialog-title">Connect an AI agent</h2>
          <button
            className="dev-settings-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="dev-settings-content">
          <AgentBridgeSettings />
        </div>
        <div className="dev-settings-footer">
          <button className="dev-settings-close-submit-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentBridgeChip({ state }) {
  const [now, setNow] = useState(Date.now());
  const activity = state.activity;
  const busy = activity && activity.ok === null;
  const recent = activity && now - activity.at < 4000;

  useEffect(() => {
    if (!activity) return undefined;
    const timer = setTimeout(() => setNow(Date.now()), 4100);
    return () => clearTimeout(timer);
  }, [activity]);

  const connected = state.status === "connected";

  return (
    <div className="agent-chip" role="status" aria-live="polite">
      <span
        className="agent-chip-dot"
        data-status={state.status}
        data-mode={state.mode}
        data-busy={busy ? "true" : "false"}
      />
      <span className="agent-chip-label" title={statusText(state)}>
        {statusText(state)}
      </span>
      {connected && (busy || recent) && (
        <span className="agent-chip-activity">{activity.tool}</span>
      )}
      {connected && (
        <label
          className="agent-chip-toggle"
          title="Let the agent change this project. Resets when the page reloads."
        >
          <input
            type="checkbox"
            checked={state.mode === "edit"}
            onChange={(e) =>
              agentBridge.setMode(e.target.checked ? "edit" : "read")
            }
          />
          Allow edits
        </label>
      )}
      {state.status === "error" &&
        (state.errorKind === "no-token" ? (
          <button className="agent-chip-button" onClick={openAgentDialog}>
            Set up
          </button>
        ) : (
          <button
            className="agent-chip-button"
            onClick={() => agentBridge.retry()}
          >
            Retry
          </button>
        ))}
      <button
        className="agent-chip-button"
        onClick={() => agentBridge.updateSettings({ enabled: false })}
        title="Disconnect and turn the AI agent bridge off"
      >
        Disconnect
      </button>
    </div>
  );
}

/** Section of the Developer Settings modal that configures the bridge. */
export function AgentBridgeSettings() {
  const state = useAgentBridgeState();
  const [token, setToken] = useState(state.settings.token);
  const [port, setPort] = useState(String(state.settings.port));
  const [showToken, setShowToken] = useState(false);

  // Save as the user types (after a short pause), on Enter, on blur, and when
  // the dialog closes, so a pasted token is never lost to Escape or Enter.
  const latest = useRef({ token, port });
  latest.current = { token, port };
  const pending = useRef(null);
  const commit = useCallback(() => {
    clearTimeout(pending.current);
    pending.current = null;
    agentBridge.updateSettings({
      token: latest.current.token,
      port: Number(latest.current.port),
    });
  }, []);
  const commitSoon = () => {
    clearTimeout(pending.current);
    pending.current = setTimeout(commit, 400);
  };
  useEffect(
    () => () => {
      if (pending.current) commit();
    },
    [commit],
  );
  const commitOnEnter = (e) => {
    if (e.key === "Enter") commit();
  };

  return (
    <div className="dev-setting-item">
      <div className="dev-setting-checkbox">
        <input
          type="checkbox"
          id="agent-bridge-enabled"
          checked={state.settings.enabled}
          onChange={(e) =>
            agentBridge.updateSettings({
              enabled: e.target.checked,
              token,
              port: Number(port),
            })
          }
        />
        <label htmlFor="agent-bridge-enabled">Connect local AI agent</label>
      </div>
      <p className="dev-setting-description">
        Connect an MCP-compatible AI agent running on this computer to the
        project open in this browser. The connection starts read-only.
      </p>
      <p className="agent-settings-intro">
        Already set up on this computer? Skip to step 2.
      </p>
      <ol className="agent-settings-steps">
        <li>
          Ask your AI app on this computer:
          <CopyBlock text={INSTALL_PROMPT} />
        </li>
        <li>
          Restart your AI app as it tells you, then in a new chat ask:
          <CopyBlock text={TOKEN_PROMPT} />
        </li>
        <li>
          Paste the pairing token below, confirm the port, then turn on
          <strong> Connect local AI agent</strong>.
        </li>
        <li>
          Ask your AI agent:
          <CopyBlock text={CONNECT_PROMPT} />
        </li>
        <li>
          From there, prompt your AI directly to interact with the open project.
        </li>
      </ol>
      <div className="agent-settings-row">
        <label htmlFor="agent-bridge-token">Pairing token</label>
        <input
          id="agent-bridge-token"
          type={showToken ? "text" : "password"}
          value={token}
          placeholder="abd-…"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setToken(e.target.value);
            commitSoon();
          }}
          onKeyDown={commitOnEnter}
          onBlur={commit}
        />
        <button
          className="agent-chip-button"
          onClick={() => setShowToken((s) => !s)}
        >
          {showToken ? "Hide" : "Show"}
        </button>
      </div>
      <div className="agent-settings-row">
        <label htmlFor="agent-bridge-port">Port</label>
        <input
          id="agent-bridge-port"
          type="number"
          min="1"
          max="65535"
          value={port}
          onChange={(e) => {
            setPort(e.target.value);
            commitSoon();
          }}
          onKeyDown={commitOnEnter}
          onBlur={commit}
        />
      </div>
      <p className="agent-settings-status" data-status={state.status}>
        {statusText(state)}
      </p>
      <p className="agent-settings-help">
        Turn on <strong>Allow edits</strong> in the connection chip only when
        you want the agent to change the project.
      </p>
    </div>
  );
}

const INSTALL_PROMPT =
  "Set up the Abundance MCP server in the AI app I'm using right now. It's the npm package @maslowcnc/abundance-bridge, a stdio server started with \"npx -y @maslowcnc/abundance-bridge@latest\". First check that Node.js 18 or newer is installed, and install it if it isn't. Then add the server to this app's MCP configuration under the name \"abundance\". Finally, tell me what I need to restart so the new tools load.";
const TOKEN_PROMPT =
  "Please find my Abundance pairing token. Start the Abundance connection if needed, then tell me the pairing token and port to enter on abundance.maslowcnc.com.";
const CONNECT_PROMPT =
  "Connect to the Abundance project open in my browser. Tell me the project name and whether access is read-only.";

/** Monospace block with a copy button. */
function CopyBlock({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="agent-settings-copy">
      <code className="agent-settings-prompt">{text}</code>
      <button className="agent-chip-button" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
