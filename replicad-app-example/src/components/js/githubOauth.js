/**
 * Upload or remove files from github. Files with null content will be deleted.
 * @param {object} files A dictionary with paths as keys and the content as the answer.
 */
this.uploadAFile = async function (files) {
  await this.createCommit(octokit, {
    owner: currentUser,
    repo: currentRepoName,
    changes: {
      files: files,
      commit: "Upload file",
    },
  });
};

/**
 * Get a file from github. Calback is called after the retrieved.
 */
this.getAFile = async function (filePath) {
  const result = await octokit.repos.getContent({
    owner: currentUser,
    repo: currentRepoName,
    path: filePath,
  });

  //content will be base64 encoded
  let rawFile = atob(result.data.content);
  return rawFile;
};

/**
 * Get a link to the raw version of a file on GitHub
 */
this.getAFileRawPath = function (filePath) {
  const rawPath =
    "https://raw.githubusercontent.com/" +
    currentUser +
    "/" +
    currentRepoName +
    "/main/" +
    filePath;
  return rawPath;
};
