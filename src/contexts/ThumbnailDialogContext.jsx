import React, { createContext, useContext, useState } from "react";
import ThumbnailDialog from "../components/dialogs/ThumbnailDialog.jsx";
import GlobalVariables from "../js/globalvariables.js";
import { useAuth } from "./AuthContext.jsx";

const ThumbnailDialogContext = createContext();

/**
 * ThumbnailDialogProvider
 * Manages the state and display of the thumbnail dialog and thumbnail upload
 */
export function ThumbnailDialogProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [projectName, setProjectName] = useState(null);
  const [onSetAsThumbnailCallback, setOnSetAsThumbnailCallback] =
    useState(null);
  const { authorizedUserOcto } = useAuth();

  const openDialog = (dataUrl, projectTitle = null, callback = null) => {
    setImageDataUrl(dataUrl);
    setProjectName(projectTitle);
    setOnSetAsThumbnailCallback(() => callback);
    setIsOpen(true);
  };

  const closeDialog = () => {
    setIsOpen(false);
    setImageDataUrl(null);
    setProjectName(null);
    setOnSetAsThumbnailCallback(null);
  };

  const handleSetAsThumbnail = async (imageDataUrl) => {
    try {
      // Convert data URL to base64
      const base64Data = imageDataUrl.split(",")[1];

      const owner = GlobalVariables.currentAWSnode.owner;
      const repo = GlobalVariables.currentAWSnode.repoName;

      // Try to get existing file SHA (needed for updates)
      let sha = null;
      try {
        const existingFile = await authorizedUserOcto.rest.repos.getContent({
          owner,
          repo,
          path: "project.png",
        });
        sha = existingFile.data.sha;
      } catch (err) {
        // File doesn't exist yet, that's fine - we'll create it
        if (err.status !== 404) {
          throw err;
        }
      }

      // Upload project.png to GitHub repo
      const uploadParams = {
        owner,
        repo,
        path: "project.png",
        message: "Update project thumbnail",
        content: base64Data,
      };

      // Include SHA if file exists (for updates)
      if (sha) {
        uploadParams.sha = sha;
      }

      const result =
        await authorizedUserOcto.rest.repos.createOrUpdateFileContents(
          uploadParams,
        );

      // Construct the download URL for the uploaded file
      const downloadUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/project.png`;
      console.log("Thumbnail uploaded successfully:", downloadUrl);

      // Update AWS item with pngURL
      try {
        const apiUpdateUrl =
          "https://hg5gsgv9te.execute-api.us-east-2.amazonaws.com/abundance-stage/update-item";

        // Call the update API or method
        const response = await fetch(apiUpdateUrl, {
          method: "POST",
          body: JSON.stringify({
            owner: owner,
            repoName: repo,
            attributeUpdates: {
              pngURL: downloadUrl,
            },
          }),
          headers: {
            "Content-type": "application/json; charset=UTF-8",
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to update AWS item: ${response.statusText}`);
        }

        console.log("AWS item updated with pngURL:", downloadUrl);
      } catch (err) {
        console.error("Error updating AWS item:", err);
        // Don't throw here - file was uploaded successfully even if AWS update fails
      }

      // Call the original callback if provided
      if (onSetAsThumbnailCallback) {
        await onSetAsThumbnailCallback(imageDataUrl);
      }
    } catch (error) {
      console.error("Error uploading thumbnail:", error);
      throw error;
    }
  };

  const value = {
    openDialog,
    closeDialog,
  };

  return (
    <ThumbnailDialogContext.Provider value={value}>
      {children}
      <ThumbnailDialog
        isOpen={isOpen}
        imageDataUrl={imageDataUrl}
        projectName={projectName}
        onClose={closeDialog}
        onSetAsThumbnail={handleSetAsThumbnail}
      />
    </ThumbnailDialogContext.Provider>
  );
}

/**
 * Hook to use the ThumbnailDialogContext
 */
export function useThumbnailDialog() {
  const context = useContext(ThumbnailDialogContext);
  if (!context) {
    throw new Error(
      "useThumbnailDialog must be used within a ThumbnailDialogProvider",
    );
  }
  return context;
}
