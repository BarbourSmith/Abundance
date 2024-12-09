

# A web based CAD program for cooperative design.

Abundance breaks with the tradition of CAD programs which inherit from drawing programs and instead inherits from logical languages like programming. This allows it to be a CAD program which can have language like features such as importing modules, version control, and collaboration.

## Login with Github

After the initial screen prompts you to login with Github, all the projects you create on Abundance will be stored as Github Repositories but you can always search for them and find them through the Abundance Platform.

<img width="754" alt="login-screen" src="https://github.com/user-attachments/assets/9393527d-3e11-483f-ac79-96a4b14de2f9">


# Projects Screen

<img width="1395" alt="project-screen" src="https://github.com/user-attachments/assets/ce041419-ea68-43e2-92d5-90f0e41a9841">


# Create Mode

## Layout of the program

Abundance has two main areas to interface with. Along the top of the screen is the logical flow of the design. In the lower portion you can see the rendering area where a 3D view of your model will appear. In the lower left is a cluster of menus that let you do things like change the parameters of your atoms. If no atom is selected, then information on the menus will reflect the information of the molecule you are currently on.

<img width="1436" alt="flow-screen" src="https://github.com/user-attachments/assets/0e746a20-cced-412e-b404-197a2a9640ad">


## Flow

A 3D model within Maslow Create is composed of interconnected nodes called Atoms and Molecules which are linked together through connectors. An atom is a shape or an operation you can perform on a shape (ie circle or translate). A molecule can contain any number of atoms in a configuration (ie generate a table leg). Think of Atoms as the built-in functions of a programming language and molecules as the functions you create. Each atom has attachment points to which connectors can attach. 

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


## Shapes 


### Regular Polygon

The regular polygon atom creates a regular polygon shape. Regular polygons are regularly extruded to create a 3D shape.

![circle]([https://raw.githubusercontent.com/alzatin/abundance-mo-fork/public/imgs/circle-example.png])

### Circle

The circle atom creates a circle sketch on the XY plane. Circle shapes are commonly extruded to create cylinders.

<img width="1176" alt="circle-example" src="https://github.com/user-attachments/assets/7bdb9773-9f93-4ddf-ae6f-ef802a59259f">


### Rectangle

The rectangle atom creates a rectangle sketch on the XY plane. Rectangles are commonly extruded to make a 3D shape.

<img width="1252" alt="rectangle-example" src="https://github.com/user-attachments/assets/528c65fc-be71-47ec-be4d-874380d92ed3">


### Text

The text atom creates a basic sketch on the XY plane with a string of your choosing. Text is commonly extruded to make a 3D shape.

<img width="1203" alt="text-example" src="https://github.com/user-attachments/assets/8b63602f-c020-4f79-a7cd-b00fd311839d">


### Molecule

The molecule atom can contain any number of atoms in a useful configuration. To add inputs to the molecule, place an input atom within it.

{picture of molecule}

## Interactions

### Intersection

The intersection atom computes the area of intersection of two shapes and creates a new shape out of that area.

{picture of intersection}

### Difference

The difference atom subtracts one shape from another.

![difference](https://raw.githubusercontent.com/BarbourSmith/Maslow-Create/master/images/Difference.PNG)

### Join 

#### Assembly

The assembly selector allows multiple shapes to be combined into one unit called an assembly. The order in which atoms are combigned matters because where shapes intersect shapes earlier in the order subtract from shapes later in the order. For example if you have a bolt which needs to create a hole in a part you should assemble first the part and then the bolt.

<img width="1162" alt="assembly-example" src="https://github.com/user-attachments/assets/49728e17-55dc-4924-a7fb-42a514ab755e">


#### Fusion

The fusion selector atom allows multiple shapes to be combined into one unit. The shapes are fused, become one and are inseparable from then on.

<img width="1126" alt="fusion-example" src="https://github.com/user-attachments/assets/8a91f7ff-55ca-4c03-ad02-dcf20ef04514">


### Shrinkwrap

The shrinkwrap atom combines multiple sketches into a single shape as if they had been shrinkwrapped. This is useful for creating shapes which would be difficult to create in other ways.

{picture of shrinkwrap}

### Loft

## Actions


### Color

The color atom gives color to a 2D or 3D shape.

{picture of translate}

### Move

The move atom moves a 3D shape in 3D space or a 2D shape in 2D space.

{picture of translate}

### Extrude
>>>>>>> Stashed changes

The extrude atom takes a 2D shape and makes it 3D.

![extrude](https://raw.githubusercontent.com/BarbourSmith/Maslow-Create/master/images/Extrude.PNG)

### Rotate

The rotate atom rotates a shape along any of its three axis.

{picture of rotate}

## Tags

### README

The README atom provides notes to the next person reading the project. The text of the readme input is added to the readme page of the project (similar to this page you are reading now).

{Show readme atom}

### Tag

The tag atom adds a tag to a part which can be later used to retrieve that part from an assembly.

### Add BOM Tag

The Add BOM Tag atom tags a part with a bill of materials item. This item will appear in the project bill of materials one time each time the tagged part appears in the final shape. For example if you have a table leg which needs four bolts, and the final model has four table legs the bolt will automatically appear in the final bill of materials 16 times.

{picture of tag}
{picture of BOM file}

## Inputs

### Input

The input atom lets you define which variables are inputs to your program. They function similar to constants, however when you share your project, the person on the other end will have the ability to change the values of the inputs. Inputs placed within a molecule will add inputs to that molecule up one level.

{picture of project being shared}

### Code

The code atom allows you to enter arbitrary [jsxcad](https://jsxcad.js.org/) code. Please note that parts of this interface are likely to change in the near future.

### Constant

The constant atom defines a constant number which can be used to control multiple inputs.

{picture of constant controling multiple inputs}

### Equation

The equation Atom lets you perform basic math operations on numbers produced by constants.

{Show equation doing something}

## Import/Export

### Gcode

The gcode atom generates gcode to cut the input shape.

![Gcode1](https://github.com/BarbourSmith/Maslow-Create/blob/master/images/Gcode1.PNG)
![Gcode2](https://github.com/BarbourSmith/Maslow-Create/blob/master/images/Gcode2.PNG)

### GitHub Molecule

The GitHub atom type is not directly available. By clicking on the GitHub tab when placing a new Atom you can search for and add any other Abundance project to your project as a molecule.


### Output

The output atom cannot be directly placed however, each molecule has one output that can't be deleted. Connect a shape to the output of a molecule to make that shape available one level up. The output of the top-level molecule is the output of the project.

![output](https://raw.githubusercontent.com/BarbourSmith/Maslow-Create/master/images/Output.PNG)


# Run Mode

If you are not the owner of a project or are not logged in you can still see a project in Run Mode. 


# Development

You can read the complete documentation at [https://maslowcreate.org/documentation/](https://maslowcreate.org/documentation/)

## How To Setup

1.  Clone the repo:

        git clone https://github.com/BarbourSmith/Abundance.git

2.  Install dependencies:

        npm install

3.  Run webpack:

        npm start

Your canvas piece should open up automatically at http://localhost:4444 and you should see 'HTML CANVAS BOILERPLATE' on hover.


