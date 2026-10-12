import React from "react";

const DEFAULT_THUMBNAIL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23e0e0e0'/%3E%3Ctext x='50' y='50' font-size='12' fill='%23999' text-anchor='middle' dominant-baseline='middle'%3ENo Image%3C/text%3E%3C/svg%3E";

export default function DropdownSectionDisplay({ sections }) {
  const [closed, setClosed] = React.useState(new Set());
  const [hoveredIndex, setHoveredIndex] = React.useState(null);

  if (!sections || !Array.isArray(sections)) return null;

  const toggle = (idx) =>
    setClosed((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });

  return (
    <div className="tutorials-list">
      {sections.map((section, idx) => (
        <div key={idx}>
          <div
            style={{
              cursor: "pointer",
              fontSize: "1.2em",
              fontWeight: 600,
              color: "#640080",
              padding: "0 0 0.3em",
              margin: "24px 0 8px",
              borderBottom: "1px solid #c4a3d5",
            }}
            onClick={() => toggle(idx)}
          >
            {section.label}
            <span style={{ marginLeft: 8 }}>
              {closed.has(idx) ? "►" : "▼"}
            </span>
          </div>
          {!closed.has(idx) && (
            <div
              className="dropdown-section-value"
              style={{
                marginLeft: 25,
                marginTop: 4,
                padding: 25,
                borderRadius: 4,
                display: "flex",
                flexWrap: section.type === "videos" ? "nowrap" : "wrap",
                justifyContent: "space-start",
                gap: 16,
                overflowX: section.type === "videos" ? "auto" : "visible",
                paddingRight: section.type === "videos" ? 40 : 25,
              }}
            >
              {Array.isArray(section.value) ? (
                section.value.map((item, i) => {
                  const hasOnClick =
                    item &&
                    typeof item === "object" &&
                    typeof item.onClick === "function";
                  const thumbnail =
                    (item && typeof item === "object" && item.thumbnail) ||
                    DEFAULT_THUMBNAIL;
                  const label =
                    item && typeof item === "object" && item.label
                      ? item.label
                      : String(item);
                  const url =
                    item && typeof item === "object" ? item.url : null;

                  return (
                    <div
                      key={i}
                      onClick={
                        url
                          ? () => window.open(url, "_blank")
                          : hasOnClick
                            ? item.onClick
                            : undefined
                      }
                      onMouseEnter={() => setHoveredIndex(`${idx}-${i}`)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        cursor: url || hasOnClick ? "pointer" : "default",
                        minWidth: section.type === "videos" ? 120 : 100,
                        textAlign: "center",
                        flexShrink: section.type === "videos" ? 0 : 1,
                        padding: 8,
                        borderRadius: 8,
                        backgroundColor:
                          hoveredIndex === `${idx}-${i}`
                            ? "rgba(196, 163, 213, 0.2)"
                            : "transparent",
                        transition: "background-color 0.2s ease",
                      }}
                    >
                      <img
                        src={thumbnail}
                        alt={label}
                        style={{
                          width: 100,
                          height: 100,
                          objectFit: "cover",
                          borderRadius: 4,
                          marginBottom: 8,
                          transition: "transform 0.2s ease",
                          transform:
                            hoveredIndex === `${idx}-${i}`
                              ? "scale(1.05)"
                              : "scale(1)",
                        }}
                      />
                      <p
                        style={{
                          fontSize: "0.95em",
                          opacity: 0.85,
                          margin: 0,
                          wordBreak: "break-word",
                          padding: 6,
                          borderRadius: 4,
                          backgroundColor:
                            hoveredIndex === `${idx}-${i}`
                              ? "#e0e0e0"
                              : "transparent",
                          transition: "background-color 0.2s ease",
                        }}
                      >
                        {label}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div
                  onClick={section.onClick ? section.onClick : undefined}
                  onMouseEnter={() => setHoveredIndex(`single-${idx}`)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    cursor: section.onClick ? "pointer" : "default",
                  }}
                >
                  <img
                    src={section.thumbnail || DEFAULT_THUMBNAIL}
                    alt={section.label}
                    style={{
                      width: 100,
                      height: 100,
                      objectFit: "cover",
                      borderRadius: 4,
                      marginBottom: 8,
                    }}
                  />
                  <p
                    style={{
                      fontSize: "0.95em",
                      opacity: 0.85,
                      margin: 0,
                      padding: 6,
                      borderRadius: 4,
                      backgroundColor:
                        hoveredIndex === `single-${idx}`
                          ? "#e0e0e0"
                          : "transparent",
                      transition: "background-color 0.2s ease",
                    }}
                  >
                    {section && typeof section === "object" && section.label
                      ? section.label
                      : String(section.value)}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
