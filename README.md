

# Abundance

[![Deploy to GitHub Pages](https://github.com/BarbourSmith/Abundance/actions/workflows/Actions.yaml/badge.svg)](https://github.com/BarbourSmith/Abundance/actions/workflows/Actions.yaml)
[![Puppeteer Tests](https://github.com/BarbourSmith/Abundance/actions/workflows/test.yaml/badge.svg)](https://github.com/BarbourSmith/Abundance/actions/workflows/test.yaml)

**A web-based CAD program for cooperative design.**

Abundance breaks with the tradition of CAD programs which inherit from drawing programs and instead inherits from logical languages like programming. This allows it to be a CAD program which can have language-like features such as importing modules, version control, and collaboration. All projects are stored as GitHub repositories, enabling seamless version control and collaborative design workflows.

🌐 **Live Application:** [abundance.maslowcnc.com](https://abundance.maslowcnc.com/)

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
  - [Login with GitHub](#login-with-github)
  - [Projects Screen](#projects-screen)
- [Create Mode](#create-mode)
  - [Flow](#flow)
  - [Layout of the Program](#layout-of-the-program)
  - [Atom Menu](#atom-menu)
  - [Atoms Reference](#atoms-reference)
- [Run Mode](#run-mode)
- [Development](#development)
  - [Setup Instructions](#setup-instructions)
  - [Available Scripts](#available-scripts)
  - [Testing](#testing)
  - [Building](#building)
  - [Deployment](#deployment)
  - [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Support](#support)

## Overview

Abundance is a modern, browser-based 3D CAD application built with React and the replicad CAD library. It provides a node-based visual programming interface where designs are composed of interconnected "Atoms" (basic operations) and "Molecules" (reusable components). Projects are automatically version-controlled through GitHub, making collaboration natural and integrated.

## Key Features

- **🎨 Visual Node-Based Design:** Create 3D models using an intuitive flow-based interface
- **🔧 Parametric Modeling:** All designs are parametric and can be easily modified
- **🤝 GitHub Integration:** Projects stored as repositories for version control and sharing
- **📦 Reusable Components:** Create and share Molecules across projects
- **💻 Code Support:** Write custom replicad code for advanced operations
- **📋 Bill of Materials:** Automatic BOM generation for assemblies
- **📤 Multiple Export Formats:** Export to STL, STEP, SVG, and more
- **🔄 Live 3D Preview:** Real-time rendering of your designs
- **👥 Collaborative Design:** Fork and remix projects from other users

## Technology Stack

- **Frontend Framework:** React 18.2.0
- **Build Tool:** Vite 5.1.6
- **3D CAD Engine:** replicad 0.16.1 (OpenCascade-based)
- **3D Rendering:** Three.js 0.161.0 with @react-three/fiber
- **Authentication:** GitHub OAuth
- **Testing:** Vitest (unit tests) & Puppeteer (E2E tests)
- **Deployment:** GitHub Pages

## Getting Started

### Login with GitHub

After the initial screen prompts you to login with GitHub, all the projects you create on Abundance will be stored as GitHub Repositories. You can always search for them and find them through the Abundance Platform.

<img width="754" alt="login-screen" src="https://github.com/user-attachments/assets/9393527d-3e11-483f-ac79-96a4b14de2f9">


### Projects Screen

Choose whether you want to create a new project, go into one of your existing projects, or take a look at a project that someone else created. If you own the selected project, you will be redirected to Create Mode. If the project belongs to someone else, you will be redirected to Run Mode where you can choose to fork the project to modify it or simply download it. 

<img width="1395" alt="project-screen" src="https://github.com/user-attachments/assets/ce041419-ea68-43e2-92d5-90f0e41a9841">


# Create Mode


## Flow

A 3D model within Maslow Create is composed of interconnected nodes called Atoms and Molecules which are linked together through connectors. An atom is a shape or an operation you can perform on a shape (ie circle or translate). A molecule can contain any number of atoms in a configuration (ie generate a table leg). Think of Atoms as the built-in functions of a programming language and molecules as the functions you create. Each atom has attachment points to which connectors can attach. 

## Layout of the program

Create Mode has two main areas to interface with. Along the top of the screen is the logical flow of the design. In the lower portion you can see the rendering area where a 3D view of your model will appear. In the lower left is a cluster of menus that lets you do things like change the parameters and dimensions of the selected shape. 

<img width="1436" alt="flow-screen" src="https://github.com/user-attachments/assets/0e746a20-cced-412e-b404-197a2a9640ad">

## Atom Menu

To see and place the available atoms on your flow screen start by right-clicking anywhere within the flow screen area to spawn the circular atom menu. Move your cursor around to spawn the sub-menus and click on the atom you want to place.

<img width="888" alt="top_menu" src="https://github.com/user-attachments/assets/fb28f196-4f31-4f26-abd2-3c1cc59d7280">

The atoms available in the circular menu are divided into 6 categories: 

### Shapes: 
        - Regular Polygon
        - Circle
        - Rectangle
        - Text
        - Molecule
        
### Interactions: 
        - Intersection
        - Difference
        - Join 
        - Loft
        - ShrinkWrap
### Actions: 
        - Color
        - Rotate
        - Extrude
        - Move
        - Genetic Algorithm (disabled)
### Inputs: 
        - Input
        - Constant
        - Equation
        - Code
### Tags:
        - ReadMe
        - Add-Bom-Tag
        - Tag
        - Extract Tag
        - CutLayout 
### Import-Export:
        - GCode
        - Import
        - Export
        - Github Molecule

## Atoms Reference

### Shapes

#### Regular Polygon

The regular polygon atom creates a regular polygon shape. Regular polygons are regularly extruded to create a 3D shape.

<img width="821" alt="polygon-example" src="https://github.com/user-attachments/assets/3d5b3fb7-34d5-49fc-b2aa-821e5df7cea4">


#### Circle

The circle atom creates a circle sketch on the XY plane. Circle shapes are commonly extruded to create cylinders.

<img width="1176" alt="circle-example" src="https://github.com/user-attachments/assets/7bdb9773-9f93-4ddf-ae6f-ef802a59259f">


#### Rectangle

The rectangle atom creates a rectangle sketch on the XY plane. Rectangles are commonly extruded to make a 3D shape.

<img width="1252" alt="rectangle-example" src="https://github.com/user-attachments/assets/528c65fc-be71-47ec-be4d-874380d92ed3">


#### Text

The text atom creates a basic sketch on the XY plane with a string of your choosing. Text is commonly extruded to make a 3D shape.

<img width="1203" alt="text-example" src="https://github.com/user-attachments/assets/8b63602f-c020-4f79-a7cd-b00fd311839d">


#### Molecule

The molecule atom can contain any number of atoms in a useful configuration. To add inputs to the molecule, place an input atom within it.

<img width="428" alt="molecule-example" src="https://github.com/user-attachments/assets/82eea26c-5383-4556-b12e-95a3d2f92fa0" />

### Interactions

#### Intersection

The intersection atom computes the area of intersection of two shapes and creates a new shape out of that area.

<img width="904" alt="intersection-example" src="https://github.com/user-attachments/assets/ce2bd3ff-f34a-452b-a270-bc104f8988a2" />


#### Difference

The difference atom subtracts one shape from another.

<img width="931" alt="difference-example" src="https://github.com/user-attachments/assets/a0a61322-8c4b-4bf7-9a73-0b26e053154f" />


#### Join 

##### Assembly

The assembly selector allows multiple shapes to be combined into one unit called an assembly. The order in which atoms are combigned matters because where shapes intersect shapes earlier in the order subtract from shapes later in the order. For example if you have a bolt which needs to create a hole in a part you should assemble first the part and then the bolt.

<img width="1162" alt="assembly-example" src="https://github.com/user-attachments/assets/49728e17-55dc-4924-a7fb-42a514ab755e">


##### Fusion

The fusion selector atom allows multiple shapes to be combined into one unit. The shapes are fused, become one and are inseparable from then on.

<img width="1126" alt="fusion-example" src="https://github.com/user-attachments/assets/8a91f7ff-55ca-4c03-ad02-dcf20ef04514">


#### Shrinkwrap

The shrinkwrap atom combines multiple sketches into a single shape as if they had been shrinkwrapped. This is useful for creating shapes that would be difficult to create in other ways.

<img width="1051" alt="shrinkwrap-example" src="https://github.com/user-attachments/assets/70ea489c-7e4b-4501-a798-14c828af3a68" />


#### Loft

<img width="940" alt="loft-example" src="https://github.com/user-attachments/assets/8ef7e0dd-38c3-42d9-bd21-db90da61d546" />

### Actions

#### Color

The color atom gives color to a 2D or 3D shape.

<img width="890" alt="color-example" src="https://github.com/user-attachments/assets/4ac141c8-b401-4cae-9b9d-84affba28ad1" />


#### Move

The move atom moves a 3D shape in 3D space or a 2D shape in 2D space.

{<img width="884" alt="move-example" src="https://github.com/user-attachments/assets/a8c1f8f7-b390-41fc-acd7-4bd7334ca6ba" />

#### Extrude

The Extrude atom takes a 2D shape and makes it 3D.

<img width="886" alt="extrude-example" src="https://github.com/user-attachments/assets/c4f949b8-e87a-4a3c-a314-ea8d70e03180" />

#### Rotate

The rotate atom rotates a shape along any of its three axis.

<img width="836" alt="rotate-example" src="https://github.com/user-attachments/assets/ae6097ad-07a4-4a14-b69b-23fda96b426b" />

#### Scale

The scale function scales a 2D or 3D shape by a specified factor. A scale factor of 1.0 keeps the original size, 2.0 doubles the size, and 0.5 halves the size. The Scale function can be used in the Code atom and works with both individual geometries and assemblies.

Example usage in Code atom:
```javascript
// Scale a shape to 150% of its original size
let scaledShape = Scale(library[inputShape], 1.5);
return scaledShape;
```


### Tags

#### README

The README atom provides notes to the next person reading the project. The text of the readme input is added to the readme page of the project (similar to this page you are reading now).

<img width="588" alt="readme-example" src="https://github.com/user-attachments/assets/5ca90c52-4341-4b96-bb9f-36dcc70ea744" />


#### Tag

The tag atom adds a tag to a part which can be later used to retrieve that part from an assembly.

<img width="986" alt="tag-example" src="https://github.com/user-attachments/assets/3b8a5270-6e7e-4a9e-9309-2902602a2ee2" />


#### Add BOM Tag

The Add BOM Tag atom tags a part with a bill of materials item. This item will appear in the project bill of materials one time each time the tagged part appears in the final shape. For example, if you have a table leg that needs four bolts, and the final model has four table legs, the bolt will automatically appear in the final bill of materials 16 times.

<img width="908" alt="bom-tag-example" src="https://github.com/user-attachments/assets/094216c3-26bb-4fb2-be46-62d3b4170d49" />
<img width="1014" alt="bom-molecule-example" src="https://github.com/user-attachments/assets/4cc3a257-262f-4145-8f7d-60ac10dfc9c6" />

### Inputs

#### Input

The input atom lets you define which variables are inputs to your program. They function similar to constants, however when you share your project, the person on the other end will have the ability to change the values of the inputs. Inputs placed within a molecule will add inputs to that molecule up one level.

<img width="377" alt="inputs-example" src="https://github.com/user-attachments/assets/13d6bd15-8a2f-447d-8a2c-08ae5c250fd4" />
<img width="426" alt="inputs-molecule-example" src="https://github.com/user-attachments/assets/af7c01bd-1719-42bb-b166-4f6e3bb59fb6" />


#### Code

The code atom allows you to enter arbitrary replicad code. For all available methods see [replicad.xyz](https://replicad.xyz)

<img width="1008" alt="code-example-1" src="https://github.com/user-attachments/assets/0617fda4-9adf-4a73-abba-7cd6cbb764f3" />
<img width="1001" alt="code-example-2" src="https://github.com/user-attachments/assets/8bf72007-5dfa-4529-8848-eac2cc022c65" />


#### Constant

The constant atom defines a constant number that can be used to control multiple inputs.

<img width="818" alt="constant-example" src="https://github.com/user-attachments/assets/2fa19ffb-198b-4046-96c1-cb850735b815" />


#### Equation

The equation atom lets you perform math operations on numbers produced by constants and inputs. The equation atom uses the [mathjs library](https://mathjs.org/) to evaluate mathematical expressions.

<img width="872" alt="equation-example" src="https://github.com/user-attachments/assets/82a8915c-4085-42c9-915d-1f1b217bb34b" />

##### Supported Math Functions

The equation atom supports a wide range of mathematical operations:

**Basic Arithmetic Operators:**
- `+` (addition), `-` (subtraction), `*` (multiplication), `/` (division)
- `%` (modulo), `^` (power/exponentiation)

**Mathematical Constants:**
- `pi` or `PI` - π (3.14159...)
- `e` or `E` - Euler's number (~2.718)
- `tau` - Circle constant (2π)
- `Infinity` - Positive infinity
- `NaN` - Not a Number

**Arithmetic Functions:**
- `sqrt(x)` - Square root
- `pow(x, y)` - Power (x raised to y)
- `abs(x)` - Absolute value
- `ceil(x)` - Round up to nearest integer
- `floor(x)` - Round down to nearest integer
- `round(x)` - Round to nearest integer
- `exp(x)` - Exponential (e^x)
- `log(x)` - Natural logarithm
- `log10(x)` - Base-10 logarithm
- `log2(x)` - Base-2 logarithm
- `sign(x)` - Sign of a number (-1, 0, or 1)
- `cube(x)` - Cube of a number
- `square(x)` - Square of a number
- `cbrt(x)` - Cube root

**Trigonometric Functions:**
- `sin(x)`, `cos(x)`, `tan(x)` - Basic trig functions (x in radians)
- `asin(x)`, `acos(x)`, `atan(x)` - Inverse trig functions
- `atan2(y, x)` - Two-argument arctangent
- `sinh(x)`, `cosh(x)`, `tanh(x)` - Hyperbolic functions

**Statistical Functions:**
- `min(a, b, ...)` - Minimum value
- `max(a, b, ...)` - Maximum value
- `mean(a, b, ...)` - Average value
- `median(a, b, ...)` - Median value
- `sum(a, b, ...)` - Sum of values
- `std(a, b, ...)` - Standard deviation

**Comparison Operators:**
- `<`, `<=`, `>`, `>=` - Comparison
- `==`, `!=` - Equality

**Logical Operators:**
- `&&` (and), `||` (or), `!` (not)

**Example Equations:**
```
x + y                    // Add two inputs
2 * pi * r              // Calculate circumference
sqrt(x^2 + y^2)         // Distance formula
sin(angle * pi / 180)   // Convert degrees to radians and calculate sine
max(width, height)      // Get maximum of two values
```

Variables in equations automatically become inputs to the atom. For example, if you enter `x + y`, two inputs named `x` and `y` will be created automatically.


### Import/Export

#### Gcode

The Gcode atom generates Maslow CNC gcode from input geometry. It can process both single parts and assemblies, automatically extracting and sorting parts in the specified direction. The atom provides configuration options for tool size, number of passes, cutting speed, and cut-through depth. Once generated, the gcode can be downloaded using the built-in download button.

For assemblies, the Gcode atom extracts individual parts, sorts them based on the selected direction (Left, Right, Top, or Bottom) using bounding boxes, and generates sequential gcode for each part. It also ensures that interior parts are cut before their containing exterior parts to prevent collision issues.

<img width="974" height="450" alt="Screenshot 2025-12-29 at 11 27 56 AM" src="https://github.com/user-attachments/assets/4ba69c96-1a9a-46e3-8a52-975e958d956a" />


#### Import

The Import atom allows you to upload a STL, SVG, or STEP file. Complex models might take a long time to compute. 

<img width="986" alt="import-example" src="https://github.com/user-attachments/assets/76bef001-d2a9-4e79-83c4-3f83bec8e2f4" />

#### Export

The export atom tags a part for export. An Export atom lets you download the selected part in a file format of your choosing and makes that part available for download in Run Mode.

<img width="997" alt="export-example" src="https://github.com/user-attachments/assets/2107d6cd-2812-4131-9f37-df52173e0716" />

#### GitHub Molecule

The GitHub atom type is not directly available. By clicking on the GitHub tab when placing a new Atom, you can search for and add any other Abundance project to your project as a molecule.

<img width="1298" alt="github-example" src="https://github.com/user-attachments/assets/bb63bb29-4a9c-4b79-85bb-f2b32c00fa2d" />

### Output

The output atom cannot be directly placed; however, each molecule has one output that can't be deleted. Connect a shape to the output of a molecule to make that shape available one level up. The output of the top-level molecule is the output of the project.

<img width="241" alt="output-example" src="https://github.com/user-attachments/assets/946feb6f-9ebe-4c47-958f-8a5407afe9ba" />



# Run Mode

If you are not the owner of a project or are not logged in, you can still see a project in Run Mode. 

<img width="1436" alt="run-mode" src="https://github.com/user-attachments/assets/c3bed30e-f253-4245-a62c-67067a5319ee">


# Development

## Setup Instructions

### Prerequisites

- Node.js 20.x or higher
- npm (comes with Node.js)
- Git

### Clone and Install

1. **Clone the repository:**

   ```bash
   git clone https://github.com/BarbourSmith/Abundance.git
   cd Abundance
   ```

2. **Install dependencies:**

   ```bash
   npm install --legacy-peer-deps
   ```

   ⚠️ **Important:** Always use the `--legacy-peer-deps` flag when installing dependencies.

3. **Configure for local development:**

   Edit `.env` file - uncomment the dev section:
   ```bash
   # Uncomment these lines for local development:
   VITE_APP_DEV = "/"
   VITE_REDIRECT_URI = "http://localhost:4444/"
   VITE_GH_OAUTH_CLIENT_ID = "Ov23liN8Q3iGPXSUHUsH"
   ```

   Edit `vite.config.js` - change the base path:
   ```javascript
   base: "/", // Change from "/Abundance" to "/" for local development
   ```

4. **Start the development server:**

   ```bash
   npm start
   ```

   The application will be available at [http://localhost:4444](http://localhost:4444)

## Available Scripts

- **`npm start`** - Start the Vite development server on port 4444
- **`npm run build`** - Build the production bundle to `dist/` folder
- **`npm run serve`** - Preview the production build locally
- **`npm run unit`** - Run unit tests with Vitest
- **`npm test`** - Run end-to-end Puppeteer tests
- **`npm run coverage`** - Generate test coverage report

## Testing

### Unit Tests

Unit tests use Vitest and test core CAD functionality:

```bash
npm run unit
```

Tests cover:
- Geometry operations (shapes, extrude, interactions)
- CAD functions (rotation, translation, boolean operations)
- Code execution and validation
- BOM (Bill of Materials) functionality

### End-to-End Tests

E2E tests use Puppeteer to test the complete application:

```bash
# Install Playwright browsers (first time only)
npx playwright install chromium

# Run E2E tests
npm test
```

**Note:** The development server must be running before executing E2E tests.

## Building

Build the production bundle:

```bash
npm run build
```

This creates an optimized production build in the `dist/` directory. The build process:
- Bundles all assets and code
- Minifies JavaScript and CSS
- Copies `index.html` to `404.html` for GitHub Pages SPA routing
- Generates source maps

## Deployment

The application is automatically deployed to GitHub Pages when changes are pushed to the `main` branch via GitHub Actions (`.github/workflows/Actions.yaml`).

**Manual deployment:**
```bash
npm run deploy
```

The live application is available at: [https://abundance.maslowcnc.com](https://abundance.maslowcnc.com)

## Troubleshooting

### Build Issues

**Problem:** Build fails with dependency errors
```bash
npm install --legacy-peer-deps
```

**Problem:** `vitest: not found` or missing binaries
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

### Testing Issues

**Problem:** Puppeteer/Playwright browser not found
```bash
npx playwright install chromium
```

**Problem:** E2E tests fail to connect
- Ensure the development server is running (`npm start`)
- Check that port 4444 is not in use by another application

### Development Server Issues

**Problem:** Port 4444 already in use
```bash
# Kill the process using port 4444
lsof -ti:4444 | xargs kill -9
```

**Problem:** OAuth login not working locally
- Verify `.env` has correct local development settings
- Ensure `VITE_REDIRECT_URI` matches your local URL

### Common Warnings

These warnings are expected and do not affect functionality:
- `rimraf` deprecation warnings
- `react-three-fiber` deprecation (replaced by `@react-three/fiber`)
- 4 npm audit vulnerabilities (peer dependency related)

## Contributing

We welcome contributions! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch:** `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Run tests:** `npm run unit && npm test`
5. **Build the project:** `npm run build`
6. **Commit your changes:** `git commit -m 'Add amazing feature'`
7. **Push to the branch:** `git push origin feature/amazing-feature`
8. **Open a Pull Request**

### Code Style

- Follow existing code patterns
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting PR

## Support

- **Issues:** [GitHub Issues](https://github.com/BarbourSmith/Abundance/issues)
- **Website:** [abundance.maslowcnc.com](https://abundance.maslowcnc.com)
- **Documentation:** See this README and in-app help

---

**Built with ❤️ by the Maslow CNC community** 


