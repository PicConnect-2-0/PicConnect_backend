require("dotenv").config();
const { Comment, Photo, User, Reply } = require("./db/models");
const http = require("http");
const express = require("express");
const cors = require("cors");
const db = require("./db");
const PORT = process.env.PORT || 8000;

// Middleware
const setupMiddleWare = (app) => {
  app.use(
    cors({
      origin: [process.env.FRONTEND_URL], //app url
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
};

//Routes: mount on api and auth
const setupRoutes = (app) => {
  app.use("/api", require("./api"));
  app.get("/", (req, res, next) => {
    console.log("HIT HOME");
    res.send("HI");
  });
};

//start server, sync db, and setup socket.io
const startServer = async (app, server, port) => {
  await db.sync();
  //socekt.io setup with cors
  const io = require("socket.io")(server, {
    cors: {
      origin: process.env.FRONTEND_URL, //app url
      //methods: ['GET', 'POST']
      credentials: true,
    },
  });

  //event handlers
  io.on("connection", (socket) => {
    console.log("A user connected");
    
    socket.on("joinRoom", async (roomId) => {
      console.log(`Joined room: ${roomId}`);
      socket.join(roomId);
      //existing comments when user joins the room
      const oldComments = await getCommentsFromDatabase(roomId);
      console.log(`Fetched comments: ${JSON.stringify(oldComments)}`);
      socket.emit("existingComments", oldComments);
    });
    //new comment events
    socket.on("newComment", async (data) => {
      console.log(`Received new comment from client: ${data}`);
      //save comment to db
      const savedComment = await saveCommentToDatabase(data.comment, data.userId, data.roomId)
      //console.log("comment ID", savedComment.id)
      const newComment = await getCommentFromDatabase(savedComment.id);
      console.log(`Saved comment to database: ${JSON.stringify(newComment, null, 2)}`);
      //console.log(`Saved comment: ${JSON.stringify(newComment)}`);
      //show comment to every other user in the room
      io.to(data.roomId).emit('newComment', newComment);
    });

    //new comment events
    socket.on("newReply", async (data) => {
      console.log(`Received new reply from client: ${JSON.stringify(data)}`);
      //save comment to db
      const savedReply = await saveReplyToDatabase(data.reply, data.userId, data.commentId);
      const newReply = await getReplyFromDatabase(savedReply.id)
      console.log(`Saved reply to database: ${newReply}`);
      console.log(`Saved reply: ${JSON.stringify(newReply)}`);
      //show comment to every other user in the room
      io.to(data.roomId).emit('newReply', newReply);
    });
    socket.on("deleteReply", async (data) => {
      console.log(`deleted new reply from client: ${data}`);
      //save comment to db
      const deleteReply = await deleteReplyFromDatabase(data.replyId);
      console.log(`deleted reply to database: ${JSON.stringify(deleteReply)} with data ${JSON.stringify(data)}`);
      //console.log(`Saved comment: ${JSON.stringify(newComment)}`);
      //show comment to every other user in the room
      io.to(data.roomId).emit('deleteReply', deleteReply);
    });

    socket.on("deleteComment", async (data) => {
      console.log(`deleted new comment from client: ${data}`);
      //save comment to db
      const deleteComment = await deleteCommentFromDatabase(data.commentId);
      console.log(`deleted comment in database: ${deleteComment}`);
      //console.log(`Saved comment: ${JSON.stringify(newComment)}`);
      //show comment to every other user in the room
      io.to(data.roomId).emit('deleteComment', data);
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected");
    });
  });
  server.listen(port, () => {
    console.log(`Server is running on port ${PORT}`);
  });
  return server;
};
const configureApp = (port) => {
  const app = express();
  setupMiddleWare(app);
  setupRoutes(app);
  // app.listen(PORT, () => {
  //     console.log(`Listening to port ${PORT}`)

  // })
  const server = http.createServer(app);
  return startServer(app, server, port);
};

module.exports = configureApp(PORT);


async function getCommentsFromDatabase(photoId) {
  try {
    const comments = await Comment.findAll({
      where: { photoId },
      include: [
        {
          model: User,
          as: "user",
        },
        {
          model: Reply,
          as: "replies",
          include: User,
        },
      ],
      order: [["createdAt", "DESC"]],
    });
    //console.log(`Comments fetched from database for photoId ${photoId}: ${comments}`);
    return comments;
  } catch (error) {
    console.error(`Failed to get comments: ${error}`);
  }
}
async function getCommentFromDatabase(commentId) {
  try {
    const comment = await Comment.findByPk(commentId, {
      include: [
        {
          model: User,
          as: "user",
        },
        {
          model: Reply,
          as: "replies",
          include: User,
        },
      ],
    });

    if (!comment) {
      console.error(`Comment with id ${commentId} not found.`);
      return null;
    }

    // console.log(`Comment fetched from database for commentId ${commentId}: ${comment}`);
    return comment;
  } catch (error) {
    console.error(`Failed to get comment: ${error}`);
    throw error;
  }
}
async function getReplyFromDatabase(commentId) {
  try {
    const reply = await Reply.findByPk(commentId, {
      include: [
        {
          model: User,
          as: "user",
        }
      ],
    });

    if (!reply) {
      console.error(`Reply with id ${commentId} not found.`);
      return null;
    }

    // console.log(`Comment fetched from database for commentId ${commentId}: ${comment}`);
    return reply;
  } catch (error) {
    console.error(`Failed to get comment: ${error}`);
    throw error;
  }
}


async function saveCommentToDatabase(comment, userId, photoId) {
  try {
    const newComment = await Comment.create({
      commentText: comment,
      userId,
      photoId,
    });
    //console.log(`Comment saved to database: ${newComment}`);
    return newComment;
  } catch (error) {
    console.error(`Failed to post comment: ${error}`);
  }
}

async function saveReplyToDatabase(reply, userId, commentId) {
  try {
    const newReply = await Reply.create({
      reply_text: reply,
      userId,
      commentId
    });
    console.log(`Comment saved to database: ${newReply}`);
    return newReply;
  } catch (error) {
    console.error(`Failed to post comment: ${error}`);
  }
}
async function deleteCommentFromDatabase(commentId) {
  try {
    // Assuming you have a model named "Reply" to interact with the replies table in the database
    const deletedReplies = await Reply.destroy({
      where: {
        commentId: commentId
      }
    });

    const deletedComment = await Comment.destroy({
      where: {
        id: commentId
      }
    });

    if (deletedComment === 0) {
      console.log(`Comment with ID ${commentId} not found.`);
      return `Comment with ID ${commentId} not found.`;
    }

    console.log(`Comment with ID ${commentId} and its associated replies deleted from the database.`);
    return {
      deletedCommentCount: deletedComment,
      deletedRepliesCount: deletedReplies
    };
  } catch (error) {
    console.error(`Failed to delete comment: ${error}`);
  }
}

async function deleteReplyFromDatabase(replyId) {
  try {
    
    const reply = await Reply.findByPk(replyId);
    const deleteReply = await Reply.destroy( {
      where: {
        id: replyId
      },
      returning: true,
    });

    if (deleteReply === 0) {
      console.log(`reply with ID ${replyId} not found.`);
      return `reply with ID ${replyId} not found.`;
    }

    console.log(`Reply with ID ${replyId} deleted from the database. ${JSON.stringify(reply.commentId)}`);
    return reply;
  } catch (error) {
    console.error(`Failed to delete comment: ${error}`);
  }
}