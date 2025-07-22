/**
 * Required External Modules
 */

import express from "express";
import axios from "axios";
import serverless from "serverless-http";

import jwt from "express-jwt";
import jwksRsa from "jwks-rsa";

const domain = "dev-ln37eaqfk7dp2480.us.auth0.com";
const audience = "https://api.github.com/";

const checkJwt = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${domain}/.well-known/jwks.json`,
  }),

  audience: audience,
  issuer: `https://${domain}/`,
  algorithms: ["RS256"],
});

/**
 * App Variables
 */

const app = express();
//const port = process.env.SERVER_PORT;

/**
 *  App Configuration
 */

app.use(express.json());

app.get("/api/greet", checkJwt, async (req, res) => {
  try {
    const userID = req.user.sub;
    const token = await fetchManagementApi();
    const gitToken = await forwardRequest(token, userID);
    // Set multiple headers
    res.set({
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      Allow: "GET, OPTIONS, POST",
      "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
      "Access-Control-Allow-Headers": "*",
    });
    res.status(200).send({ success: true, message: gitToken });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});
app.get("/api/ourAutho", async (req, res) => {
  try {
    const code = req.query.code; // Retrieve 'code' from query parameters
    console.log("Code received:", code);

    // Set multiple headers
    res.set({
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      Allow: "GET, OPTIONS, POST",
      "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
      "Access-Control-Allow-Headers": "*",
    });

    const response = await axios.get(
      "https://github.com/login/oauth/access_token",
      {
        params: {
          client_id: "Ov23liN8Q3iGPXSUHUsH",
          client_secret: process.env.CLIENT_SECRET_GIT,
          code: code,
          redirect_uri: `http://localhost:4444/callback`,
        },
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "application/json",
        },
      }
    );
    const access_token = response.data.access_token;

    res.status(200).send({ success: true, message: access_token });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});
app.get("/api/mobAutho", async (req, res) => {
  try {
    const code = req.query.code; // Retrieve 'code' from query parameters
    console.log("Code received:", code);

    // Set multiple headers
    res.set({
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      Allow: "GET, OPTIONS, POST",
      "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
      "Access-Control-Allow-Headers": "*",
    });

    const response = await axios.get(
      "https://github.com/login/oauth/access_token",
      {
        params: {
          client_id: "Ov23lioNfq4Q063COhYR",
          client_secret: process.env.CLIENT_SECRET_GIT_MOB,
          code: code,
          redirect_uri: `http://192.168.1.169:4444/callback`,
        },
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "application/json",
        },
      }
    );
    const access_token = response.data.access_token;

    res.status(200).send({ success: true, message: access_token });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});
app.get("/api/deployAutho", async (req, res) => {
  try {
    const code = req.query.code; // Retrieve 'code' from query parameters
    console.log("Code received:", code);

    // Set multiple headers
    res.set({
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      Allow: "GET, OPTIONS, POST",
      "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
      "Access-Control-Allow-Headers": "*",
    });

    const response = await axios.get(
      "https://github.com/login/oauth/access_token",
      {
        params: {
          client_id: "Ov23liogKqBPbZwB4H5C",
          client_secret: process.env.CLIENT_SECRET_GIT_DEPLOY,
          code: code,
          redirect_uri: `https://abundance.maslowcnc.com/callback`,
        },
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "application/json",
        },
      }
    );
    const access_token = response.data.access_token;

    res.status(200).send({ success: true, message: access_token });
  } catch (error) {
    res.status(500).send({ success: false, message: error.message });
  }
});

app.get("/api/test", (req, res) => {
  const code = req.query.code; // Retrieve 'code' from query parameters
  console.log("Code received:", code);

  // Set multiple headers
  res.set({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    Allow: "GET, OPTIONS, POST",
    "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
    "Access-Control-Allow-Headers": "*",
  });

  res.status(200).send({ success: true, message: code });
});

const forwardRequest = async (token, userID) => {
  const options = {
    method: "GET",
    url: `https://dev-ln37eaqfk7dp2480.us.auth0.com/api/v2/users/${userID}`,
    headers: { Authorization: `Bearer ${token}` },
  };

  try {
    const response = await axios.request(options);
    let gitToken = response.data.identities[0].access_token;
    return gitToken;
  } catch (error) {
    throw new Error("Failed to fetch gitToken");
  }
};

const fetchManagementApi = async () => {
  const url = "https://dev-ln37eaqfk7dp2480.us.auth0.com/oauth/token";
  const headers = {
    "Content-Type": "application/json",
  };

  const body = JSON.stringify({
    client_id: "XWdAtXHXzzoIzbAj39I9ffebVfJWxpx4",
    client_secret: process.env.CLIENT_SECRET,
    audience: "https://dev-ln37eaqfk7dp2480.us.auth0.com/api/v2/",
    grant_type: "client_credentials",
  });

  try {
    const response = await axios.post(url, body, { headers });
    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.data.access_token;
  } catch (error) {
    console.error(error);
    throw new Error("Failed to fetch management API token");
  }
};

// Uncomment and use the apiRouter if needed
// app.use("/api", apiRouter);
// apiRouter.use("/messages", messagesRouter);

app.use(function (err, req, res, next) {
  console.log(err);
  res.status(500).send(err.message);
});

/**
 * Server Activation

app.listen(serverPort, () =>
  console.log(`API Server listening on port ${serverPort}`)
); */

export const handler = serverless(app);
