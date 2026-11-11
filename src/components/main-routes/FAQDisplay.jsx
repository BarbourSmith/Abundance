// FAQDisplay styles
const FAQ_DISPLAY_STYLES = `
.faq-list-container {
  max-width: 80%;
  margin: 60px 30px;
  padding-right: 30px;
  overflow-y: auto;
  height: 90%;
  scrollbar-width: thin;
  scrollbar-color: #888 #f1f1f1;
}
.faq-list-item {
  margin-bottom: 12px;
}
.faq-question {
  cursor: pointer;
  border-radius: 4px;
  padding: 8px;
  font-weight: normal;
  background: none;
  transition: background 0.2s, font-weight 0.2s;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.faq-question-open {
  font-weight: bold;
  background: #f6f6f6;
}
.faq-arrow {
  margin-left: 8px;
  float: right;
}
.faq-answer {
  margin-left: 16px;
  margin-top: 6px;
  padding: 8px;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 4px;
  font-size: 0.98em;
}
`;
import React from "react";

const FAQ_LIST = [
  {
    question: "What is Abundance®?",
    answer:
      'Abundance is a modern, browser-based 3D CAD application built with React and the replicad CAD library. It provides a node-based visual programming interface where designs are composed of interconnected "Atoms" (basic operations) and "Molecules" (reusable components). Projects are automatically version-controlled through GitHub, making collaboration natural and integrated.',
  },
  {
    question: "Where are my designs and projects stored?",
    answer:
      "All your designs and projects in Abundance are automatically stored as GitHub repositories in your account. This means you get real version control, history, and collaboration features for free.",
  },
  {
    question: "How do I open or create a new design?",
    answer:
      "After logging in, you can create a new project (design), which creates a corresponding GitHub repository, or open existing projects from your list of repositories.",
  },
  {
    question: "Can I collaborate with others on my designs?",
    answer:
      "Yes! Others can fork your project repository and make their own changes. We haven't yet added pull request built in features or branching but we will in the future.",
  },
  {
    question: "How does saving work? Do I need to save my work manually?",
    answer:
      "Your work is synced with your connected GitHub repository. There is an auto-save feature that saves every 5 minutes, or you can manually save your work using the 'Save' button or Ctrl+S.",
  },
  {
    question: "How can I access my designs later or on another device?",
    answer:
      "Simply log in to Abundance again using your GitHub account. All your projects will be available through the project/repository browser.",
  },
  {
    question: "Can I import files or export my designs?",
    answer:
      "You can import or export designs using the 'Import' or 'Export' options in the interface. Supported formats are SVG, STL, and STEP for import, and STL and SVG for export.",
  },
  {
    question: "Are there templates or sample projects to learn from?",
    answer:
      "Yes! Look for a 'Gallery,' 'Templates,' or 'Examples' section after you log in, where you can browse public projects or clone them to your own account.",
  },
  {
    question: "How do I report a bug or make a feature request?",
    answer: "Open an issue on the Abundance GitHub repository",
  },
  {
    question:
      "Why does the app seem slow when loading or rendering complex designs?",
    answer:
      "Abundance uses advanced 3D geometry calculations in the browser, which can be resource-intensive. Very complex models or slow devices may result in longer load or processing times. We are working to make it faster and more reliable.",
  },
  {
    question:
      "What should I do if I encounter errors or something doesn’t load?",
    answer:
      "Try refreshing the browser page, ensure your internet connection is stable, and use a supported, up-to-date browser. If the problem continues, check your GitHub repository for errors and report the issue if needed.",
  },
  {
    question: "Do I need to update anything manually?",
    answer:
      "No manual updates are needed—Abundance deploys updates automatically. If you see unexpected behavior, try clearing your browser cache or reloading the page.",
  },
  {
    question: "Where can I go for more help?",
    answer:
      "Use the user-guide documentation, or tutorials. You can also visit the Abundance GitHub repository or community forums if available. Go to the Abundance Questions forum to ask questions and get support.",
  },
];

export default function FAQDisplay() {
  const [openIndex, setOpenIndex] = React.useState(null);

  // Inject styles at the top of the file/component
  React.useEffect(() => {
    if (!document.getElementById("faq-display-styles")) {
      const style = document.createElement("style");
      style.id = "faq-display-styles";
      style.innerHTML = FAQ_DISPLAY_STYLES;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <div className="faq-list-container">
      {FAQ_LIST.map((faq, idx) => (
        <div key={idx} className="faq-list-item">
          <div
            className={
              "faq-question login-nav-item" +
              (openIndex === idx ? " faq-question-open" : "")
            }
            onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
          >
            <span>{faq.question}</span>
            <span className="faq-arrow">{openIndex === idx ? "▼" : "►"}</span>
          </div>
          {openIndex === idx && <div className="faq-answer">{faq.answer}</div>}
        </div>
      ))}
    </div>
  );
}
