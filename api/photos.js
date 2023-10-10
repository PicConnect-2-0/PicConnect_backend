const express = require("express");
const { fetchFromCache, invalidateCache }  = require('./cacheHelper')
const fs = require("fs");
const exiftool = require("exiftool-vendored").exiftool;
const multer = require("multer");
const router = express.Router();
const {
  Photo,
  Tag,
  Camera_Details,
  Location,
  User,
  Like,
} = require("../db/models");
const { Op, json } = require("sequelize");

const { Sequelize } = require("sequelize");
// const { default: Redis } = require("ioredis");
//create new redis instance
// const redis = new Redis(process.env.REDIS_URL);

//Root here is localhost:8000/api/photo
router.get("/", async (req, res, next) => {
  try {
    const allPhotos = await fetchFromCache('allPhotos', () => {
      return Photo.findAll({
        //if you want to randomize the data, - also uncomment sequelize too
        //order: [[Sequelize.literal('RAND()')]],
        limit: 30,
        //all the includes
        include: { all: true, nested: true },
      });
    });

    allPhotos
      ? res.status(200).json(allPhotos)
      : res.status(404).send("Photos Not Found");
  } catch (error) {
    next(error);
  }
});


router.get("/:id", async (req, res, next) => {
  const photoId = req.params.id;
  try {
    const singlePhoto = await fetchFromCache(`photo:${photoId}`, () => {
      return Photo.findByPk(photoId, {
        //all the includes
        include: { all: true, nested: true },
      });
    });
    singlePhoto
      ? res.status(200).json(singlePhoto)
      : res.status(404).send("Photo Not Found");
  } catch (error) {
    next(error);
  }
});


router.get("/user/:id", async (req, res, next) => {
  const { id } = req.params;
  try {
    const photos = await fetchFromCache(`user:${id}:photos`, () => {
      return Photo.findAll({ where: { userId: id } });
    });
    res.json(photos);
  } catch (error) {
    next(error);
  }
});


//add photo
router.post("/addPhoto", async (req, res, next) => {
  try {
    console.log(req.body);
    const {
      GPSAltitude,
      GPSLatitude,
      GPSLongitude,
      GPSPosition,
      description,
      downloads,
      location_name,
      exposure_time,
      focal_length,
      iso,
      make,
      model,
      title,
      urls,
      userId,
      tz,
      aperture,
    } = req.body;
    //ceeate new row in location table adn retrun it to retreive id
    const latitude = GPSLatitude;
    const longitude = GPSLongitude;
    const city = tz;
    const createLocation = await Location.create(
      { city, location_name, latitude, longitude },
      { returning: true }
    ).catch((error) => {
      console.error("Error creating location:", error);
    });
    const locationId = createLocation.id;
    //create new row in cameradetails and return it to retreive id
    const createCameraDetails = await Camera_Details.create(
      { make, model, exposure_time, aperture, focal_length, iso },
      { returning: true }
    ).catch((error) => {
      console.error("Error creating Camera_Details:", error);
    });
    const cameraDetailId = createCameraDetails.id;

    const createPhoto = await Photo.create({
      title,
      description,
      downloads,
      urls,
      userId,
      locationId,
      cameraDetailId,
    });

    await invalidateCache("allPhotos", `user:${userId}:photos`);

    createPhoto
      ? res.status(200).json(createPhoto)
      : res.status(400).send("Can't add photo");
  } catch (error) {
    next(error);
  }
});

// Set up multer for handling file uploads
//multer options
const upload = multer({ dest: "upload" });
router.post("/extract-metadata", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Get the path of the uploaded photo
    const filePath = req.file.path;

    // Specify the tags you want to extract from the metadata
    const tagsToExtract = [
      "Make",
      "Model",
      "ExposureTime",
      "ISO",
      "FocalLength",
      "GPSLatitude",
      "GPSLongitude",
      "GPSAltitude",
      "GPSPosition",
      "tz",
      "Aperture",
    ];
    // Create an object to hold the extracted tags and their values
    const extractedTags = {};
    // Extract metadata using exiftool
    const metadata = await exiftool.read(filePath);
    if (metadata) {
      tagsToExtract.forEach((tag) => {
        if (tag in metadata) {
          extractedTags[tag] = metadata[tag];
        }
      });

      // Return the metadata as the response
      res.json(extractedTags);
    }
    // Delete the uploaded image from upload folder after sending the response
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error("Error deleting the file:", err);
      }
      console.log("File deleted successfully");
    });
  } catch (err) {
    console.error("Error extracting metadata:", err);
    res.status(500).json({ error: "Error extracting metadata" });
  }
});
//update photo
router.put("/:id", async (req, res, next) => {
  const photoId = req.params.id;
  const updatePhoto = req.body;
  try {
    const updatedPhoto = await Photo.update(updatePhoto, {
      where: { id: photoId },
    });

    await invalidateCache("allPhotos");

    updatedPhoto
      ? res.status(200).json(updatedPhoto)
      : res.status(400).send("Photo not found");
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  const photoId = req.params.id;
  try {

    const photo = await Photo.findByPk(photoId);

    if (!photo) {
      return res.status(400).send("Photo not found");
    }

    const userId = photo.userId; 

    const deletedPhoto = await Photo.destroy({
      where: { id: photoId },
    });

    await invalidateCache("allPhotos");
    await invalidateCache(`user:${userId}:photos`)
    await invalidateCache(`user:${userId}:likes`);

    deletedPhoto
      ? res.status(200).send("Photo deleted")
      : res.status(400).send("Photo not found");
  } catch (error) {
    next(error);
  }
});

router.get("/tag/:tagId", async (req, res, next) => {
  const tagId = req.params.tagId;
  console.log(tagId);
  try {
    const tagPhotos = await Tag.findByPk(tagId, {
      include: { all: true, nested: true },
    });
    tagPhotos
      ? res.status(200).json(tagPhotos)
      : res.status(400).send("Photos not found");
  } catch (error) {
    next(error);
  }
});
// Like photo
router.post("/:photoId/like", async (req, res, next) => {
  try {
    const userId = req.body.userId; 
    const photoId = req.params.photoId;
    console.log("Request body:", req.body);
    console.log(`Attempting to like photo ${photoId} for user ${userId}`);
    const like = await Like.create({ userId, photoId });
    console.log(`Successfully liked photo ${photoId} for user ${userId}`);

    //Increment the like count
    const photo = await Photo.findByPk(photoId);
    photo.likesCount += 1;
    await photo.save();

    await invalidateCache(`user:${userId}:likes`)
    await invalidateCache(`photo:${photoId}`)
    res.status(200).json(like);
  } catch (error) {
    //console.error(`Failed to like photo ${photoId} for user ${userId}`, error);
    next(error);
  }
});

// Unlike photo
router.delete("/:photoId/unlike", async (req, res, next) => {
  try {
    const userId = req.body.userId; // let's assume you send userId in the request body
    const photoId = req.params.photoId;
    console.log(
      `User with ID: ${userId} is unliking photo with ID: ${photoId}`
    );
    await Like.destroy({ where: { userId, photoId } });

    // Decrement the likesCount
    const photo = await Photo.findByPk(photoId);
    photo.likesCount -= 1;
    await photo.save();
    
    await invalidateCache(`user:${userId}:likes`)
    await invalidateCache(`photo:${photoId}`)

    res.status(200).send("Photo unliked")
    
  } catch (error) {
    next(error);
  }
});

/**
 * Following routing will enable the search function which will give out the list of photos according to the user's
 * given prompt
 * They will be search on following tables
 * Photo itself in title,
 * Location in city and location_name,
 * Camera_Details in make and model,
 * Tag in tag_name
 */
router.post("/search", async (req, res, next) => {
  let { query } = req.body;
  query = query.toLowerCase();

  try {
    //find if the tag exists or consider even is it a tag
    const tag = await Tag.findOne({
      where: {
        tag_name: { [Op.iLike]: `%${query}%` },
      },
      include: [{ all: true, nested: true }],
    });

    //handling on one to many table (location and camera detail) and Photos
    //only prep for searchOptions
    const searchOptions = {
      where: {
        [Op.or]: [
          { title: { [Op.iLike]: `%${query}%` } },
          {
            "$location.city$": {
              [Op.iLike]: `%${query}%`,
            },
          },
          {
            "$location.location_name$": {
              [Op.iLike]: `%${query}%`,
            },
          },
          {
            "$location.city$": {
              [Op.iLike]: `%${query}%`,
            },
          },
          {
            "$camera_detail.make$": {
              [Op.iLike]: `%${query}%`,
            },
          },
          {
            "$camera_detail.model$": {
              [Op.iLike]: `%${query}%`,
            },
          },
        ],
      },
      include: [
        { model: Location, require: true, attributes: [], as: "location" },
        {
          model: Camera_Details,
          require: true,
          attributes: [],
          as: "camera_detail",
        },
        { model: Tag, require: true, attributes: [], as: "tags" },
        { all: true, nested: true },
      ],
    };
    //init blank array for searchResult that hasn't check duplicates.
    let searchResult = [];
    //if tag exists, find all photos with tag
    if (tag) {
      const photosWithTag = tag.photos;
      console.log(photosWithTag);
      searchResult.push(...photosWithTag);
    }
    //get all photos from searchOptions then push to the searchResult
    const photoSearchOptions = await Photo.findAll(searchOptions);
    searchResult.push(...photoSearchOptions);

    //check the duplicate with photoIds
    const uniqueSearchResults = [];
    const uniquePhotoIds = new Set();
    for (let eachPhoto of searchResult) {
      if (!uniquePhotoIds.has(eachPhoto.id)) {
        uniqueSearchResults.push(eachPhoto);
        uniquePhotoIds.add(eachPhoto.id);
      }
    }
    uniqueSearchResults.length > 0
      ? res.status(200).json(uniqueSearchResults)
      : res.status(400).send("No photo found");
  } catch (error) {
    next(error);
  }
});

router.post("/restrictedSearch", async (req, res, next) => {
  let { query } = req.body;
  const {
    title,
    loc_city,
    loc_name,
    camDetail_make,
    camDetail_model,
    tagPhoto,
  } = req.body;
  query = query.toLowerCase();
  searchResult = [];

  try {
    if (title) {
      const titlePhotoSearch = await Photo.findAll({
        where: { title: query },
        include: { all: true, nested: true },
      });
      searchResult.push(...titlePhotoSearch);
    }

    if (loc_city) {
      const cityPhotoSearch = await Photo.findAll({
        where: {
          "$location.city$": {
            [Op.iLike]: `%${query}%`,
          },
        },
        include: [
          { model: Location, require: true, attributes: [], as: "location" },
          { all: true, nested: true },
        ],
      });
      searchResult.push(...cityPhotoSearch);
    }

    if (loc_name) {
      const locNamePhotoSearch = await Photo.findAll({
        where: {
          "$location.location_name$": {
            [Op.iLike]: `%${query}%`,
          },
        },
        include: [
          { model: Location, require: true, attributes: [], as: "location" },
          { all: true, nested: true },
        ],
      });
      searchResult.push(...locNamePhotoSearch);
    }

    if (camDetail_make) {
      const camMakePhotoSearch = await Photo.findAll({
        where: {
          "$camera_detail.make$": {
            [Op.iLike]: `%${query}%`,
          },
        },
        include: [
          {
            model: Camera_Details,
            require: true,
            attributes: [],
            as: "camera_detail",
          },
          { all: true, nested: true },
        ],
      });
      searchResult.push(...camMakePhotoSearch);
    }

    if (camDetail_model) {
      const camModelPhotoSearch = await Photo.findAll({
        where: {
          "$camera_detail.model$": {
            [Op.iLike]: `%${query}%`,
          },
        },
        include: [
          {
            model: Camera_Details,
            require: true,
            attributes: [],
            as: "camera_detail",
          },
          { all: true, nested: true },
        ],
      });
      searchResult.push(...camModelPhotoSearch);
    }

    if (tagPhoto) {
      const tag = await Tag.findOne({
        where: {
          tag_name: { [Op.iLike]: `%${query}%` },
        },
        include: [{ all: true, nested: true }],
      });
      const photosWithTag = tag.photos;
      console.log(photosWithTag);
      searchResult.push(...photosWithTag);
    }

    const uniqueSearchResults = [];
    const uniquePhotoIds = new Set();
    for (let eachPhoto of searchResult) {
      if (!uniquePhotoIds.has(eachPhoto.id)) {
        uniqueSearchResults.push(eachPhoto);
        uniquePhotoIds.add(eachPhoto.id);
      }
    }
    uniqueSearchResults.length > 0
      ? res.status(200).json(uniqueSearchResults)
      : res.status(400).send("No photo found");
  } catch (error) {
    next(error);
  }
});
/**
 * This advanced search will search the photos with more than one user specified filters
 * User will be prompt to give inputs for all category that he wants to search in
 */
router.post('/advancedSearch', async (req, res, next) => {
    const { title, loc_city, loc_name, camDetail_make, camDetail_model, tagPhoto } = req.body;
    try {
        const photoSearchOptions = {
            where: {},
            include: [
                { model: Location, require: true, attributes: [], as: "location" },
                { model: Camera_Details, require: true, attributes: [], as: "camera_detail" },
                { all: true, nested: true }
            ],
        };

        if(title) {
            photoSearchOptions.where.title = { [Op.iLike]: `%${title}%` };
        };
        if(loc_city) {
            photoSearchOptions.where["$location.city$"] = {[Op.iLike]: `%${loc_city}%` };
        };
        if(loc_name) {
            photoSearchOptions.where["$location.location_name$"] = {[Op.iLike]: `%${loc_name}%` };
        };
        if(camDetail_make){
            photoSearchOptions.where["$camera_detail.make$"] =  {[Op.iLike]: `%${camDetail_make}%` };
        };
        if(camDetail_model){
            photoSearchOptions.where["$camera_detail.model$"] =  {[Op.iLike]: `%${camDetail_model}%` };
        };
        if(tagPhoto){
            photoSearchOptions.include.push({
                model: Tag,
                require: true,
                where: {
                    tag_name: {[Op.iLike]: `%${tagPhoto}`}
                }
            })
        };
        const searchResult = await Photo.findAll(photoSearchOptions);
        searchResult
            ? res.status(200).json(searchResult)
            : res.status(400).send("No Photo found");
    } 
    catch(error){
        next(error)
    }
});


module.exports = router;
