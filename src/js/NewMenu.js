import CMenu from "./circular-menu";
import GlobalVariables from "./globalvariables.js";

/**
 * Html element that contains the circular menu
 */
var ele = null; //document.querySelector('#circle-menu1')
var cmenu;

const createCMenu = (targetElement, setSearchingGithub) => {
  ele = targetElement;
  // /**
  //      * Runs to create submenus from Global Variables atomCategories. Populates menu objects
  //      * @param {object} group - Name of the category to find appropriate atoms
  //      */
  const makeArray = (group) => {
    var menuArray = [];
    for (var key in GlobalVariables.availableTypes) {
      var instance = GlobalVariables.availableTypes[key];
      if (instance.atomCategory === group) {
        var subMenu = new Object();
        subMenu.title = `${instance.atomType}`;
        subMenu.icon = `${instance.atomType}`;
        subMenu.name = instance.atomType;

        subMenu.click = function menuClick(e, title) {
          if (title.icon === "GitHubMolecule") {
            const containerX = parseInt(cmenu._container.style.left, 10);
            const containerY = parseInt(cmenu._container.style.top, 10);
            GlobalVariables.lastClick = [containerX, containerY];
            setSearchingGithub(true);
          } else {
            setSearchingGithub(false);
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
   * This creates a new instance of the circular menu.
   */
  cmenu = CMenu(ele.current).config({
    hideAfterClick: true,
    percent: 0.15,
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
        icon: "Shapes",
        menus: makeArray("Shapes"),
      },
      {
        title: "Interactions",
        icon: "Interaction",
        menus: makeArray("Interactions"),
      },
    ],
  });

  /*Mask the default context menu on the main canvas*/
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
    var clickHandledByAtom = false;
    
    // Ensure canvas regains focus after placing atom
    const flowCanvas = document.getElementById("flow-canvas");
    if (flowCanvas) {
      flowCanvas.focus();
    }
  }
};

export { createCMenu, cmenu };
