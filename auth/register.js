const express = require("express");
const router = express.Router();
const admin = require("firebase-admin");

//route is not /auth/register
const User = require("../db/models/user");
admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.TYPE,
    project_id: process.env.PROJECT_ID,
    private_key_id: process.env.PRIVATE_KEY_ID,
    private_key: process.env.PRIVATE_KEY.replace(/\\n/g, "\n"),
    client_email: process.env.CLIENT_EMAIL,
    client_id: process.env.CLIENT_ID,
    auth_uri: process.env.AUTH_URI,
    token_uri: process.env.TOKEN_URI,
    auth_provider_x509_cert_url: process.env.AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.CLIENT_X509_CERT_URL,
    universe_domain: process.env.UNIVERSE_DOMAIN,
  })
});

router.post("/", (req, res) => {
  console.log("here in register");
  const token = req.header("Authorization").replace("Bearer ", "");

  admin
    .auth()
    .verifyIdToken(token)
    .then((decodedToken) => {
      const id = decodedToken.uid;
      const email = decodedToken.email;
      const name = decodedToken.name;

      //handle is user with same id exists in the db
      User.findOne({ where: { id } })
        .then((user) => {
          //in case, user already exists,
          if (user) {
            res.status(409).json({ error: "User already registered" });
          } else {
            User.create({ id, name, email })
              .then((user) => res.json(user))
              .catch((err) => {
                console.error(err);
                res.status(500).json({ error: "Failed to register user" });
              });
          }
        })
        .catch((err) => {
          console.log(err);
          res.status(500).json({ error: "Failed to check if user exists" });
        });
    })
    .catch((error) => {
      console.log(error);
      res.status(401).json({ error: "Unauthorized " });
    });
});
module.exports = router;
