import CMenu from "./circular-menu";
import GlobalVariables from "./globalvariables.js";
import { getFrequentMolecules } from "./recentProjectsManager.js";

/**
 * Html element that contains the circular menu
 */
var ele = null; //document.querySelector('#circle-menu1')
var cmenu;
var shortcutsMap = {}; // Store reverse mapping of atomType to shortcut key

const createCMenu = (targetElement, setExpandedMenu, shortCuts) => {
  ele = targetElement;
  
  // Create reverse mapping from atomType to shortcut key
  if (shortCuts) {
    shortcutsMap = {};
    for (const [key, atomType] of Object.entries(shortCuts)) {
      // Only store single character shortcuts (not special cases like "(ALT)")
      if (key.length === 1) {
        shortcutsMap[atomType] = key;
      }
    }
  }
  
  // /**
  //      * Runs to create submenus from Global Variables atomCategories. Populates menu objects
  //      * @param {object} group - Name of the category to find appropriate atoms
  //      */
  const makeArray = (group) => {
    var menuArray = [];
    for (var key in GlobalVariables.availableTypes) {
      var instance = GlobalVariables.availableTypes[key];
      if (instance.atomCategory === group) {
        if (instance.atomType === "Box") {
          continue;
        }
        var subMenu = new Object();
        subMenu.title = `${instance.atomType}`;
        subMenu.icon = `${instance.atomType}`;
        subMenu.name = instance.atomType;

        subMenu.click = function menuClick(e, title) {
          if (title.icon === "GitHubMolecule") {
            e.target.id = title.name;
            placeNewNode(e);
            setExpandedMenu("git-search");
            if (e.type === "touchend") {
              //need to prevent mousedown from running to keep gitsearch open
              cmenu.hide();
              e.preventDefault();
              console.log(
                "Touch event detected, preventing further click behavior."
              );
            }
          } else {
            e.target.id = title.name;
            placeNewNode(e);
          }
        };
        menuArray.push(subMenu);
      }
    }
    return menuArray;
  };

  /**
   * Creates the GitHub submenu with frequently used GitHub molecules
   */
  const makeGithubMenu = () => {
    const menuArray = [];
    
    // Add frequent molecules
    const frequentMolecules = getFrequentMolecules();
    frequentMolecules.forEach((molecule, index) => {
      const displayName = molecule.displayName || molecule.repoName.replace(/-/g, ' ');
      const subMenu = {
        title: `${displayName}`,
        icon: "GitHubMolecule",
        name: `${molecule.owner}/${molecule.repoName}`,
        isMolecule: true,
        owner: molecule.owner,
        repoName: molecule.repoName,
        click: function menuClick(e, title) {
          // Place the molecule on the canvas
          const containerX = parseInt(cmenu._container.style.left, 10);
          const containerY = parseInt(cmenu._container.style.top, 10);
          const position = {
            x: GlobalVariables.pixelsToWidth(containerX),
            y: GlobalVariables.pixelsToHeight(containerY)
          };
          
          GlobalVariables.currentMolecule.loadGithubMoleculeByName(
            { owner: title.owner, repoName: title.repoName },
            {},
            [],
            position
          ).catch((error) => {
            console.error('Error loading molecule:', error);
            alert(`Error loading molecule: ${title.name}`);
          });
          
          cmenu.hide();
        }
      };
      menuArray.push(subMenu);
    });
    
    // If no items, show a placeholder
    if (menuArray.length === 0) {
      menuArray.push({
        title: "No recent items",
        icon: "github",
        name: "empty",
        disabled: true
      });
    }
    
    return menuArray;
  };

  /**
   * This creates a new instance of the circular menu.
   */
  cmenu = CMenu(ele.current).config({
    hideAfterClick: GlobalVariables.isMobile() ? false : true,
    percent: 0.15,
    shortcutsMap: shortcutsMap,
    menus: [
      {
        title: "Actions",
        icon: "Actions",
        menus: makeArray("Actions"),
      },
      {
        title: "Inputs",
        icon: "Inputs",
        menus: makeArray("Inputs"),
      },
      {
        title: "Tags",
        icon: "Tags",
        menus: makeArray("Tags"),
      },
      {
        title: "Import/Export",
        icon: "Import-Export",
        menus: makeArray("ImportExport"),
      },
      {
        title: "Shapes",
        icon: "shapes",
        menus: makeArray("Shapes"),
      },
      {
        title: "Interactions",
        icon: "Interaction",
        menus: makeArray("Interactions"),
      },
      {
        title: "GitHub",
        icon: "github",
        menus: makeGithubMenu(),
      },
    ],
  });

  /* Mask the default context menu on the main canvas*/
  document
    .getElementById("flow-canvas")
    .addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

  /*Mask the default context menu on the menu*/
  ele.current.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // /**
  //      * Runs when a menu option is clicked to place a new atom from the local atoms list.
  //      * @param {object} ev - The event triggered by click event on a menu item.
  //      */
  function placeNewNode(e) {
    let clr = e.target.id;
    const containerX = parseInt(cmenu._container.style.left, 10);
    const containerY = parseInt(cmenu._container.style.top, 10);
    GlobalVariables.currentMolecule.placeAtom(
      {
        x: GlobalVariables.pixelsToWidth(containerX),
        y: GlobalVariables.pixelsToHeight(containerY),
        parent: GlobalVariables.currentMolecule,
        atomType: clr,
        uniqueID: GlobalVariables.generateUniqueID(),
      },
      true
    );
    //Simulate a click on the new atom
    cmenu.hide();
    var clickHandledByAtom = false;

    // Ensure canvas regains focus after placing atom
    const flowCanvas = document.getElementById("flow-canvas");
    if (flowCanvas) {
      flowCanvas.focus();
    }
  }
};

export { createCMenu, cmenu };
