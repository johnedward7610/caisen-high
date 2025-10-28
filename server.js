const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
// In-memory post storage
let posts = [];
const upload = multer({ dest: "uploads/" });
app.use(express.static("public")); // serve HTML/JS
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const webpush = require("web-push");
app.use(express.json());

webpush.setVapidDetails(
  "mailto:school@app.com",
  "BJObTyA1yj3TpMXHLmXvwpx3sjk45HW9Ly3Cw0aKWwCUkxo_Uo0y3BoeOCvBv0uOZ8Mdskcb10r7RpycoeQ37OQ",
  "RlSpB2IyYGw7kjdeTbH8-uXrzuID6UJP_2MCVkvcmDc"
);

let studentSubscriptions = [];

// Route to save subscription
app.post("/subscribe", (req, res) => {
  const subscription = req.body;

  // prevent duplicates
  if (!studentSubscriptions.find(sub => sub.endpoint === subscription.endpoint)) {
    studentSubscriptions.push(subscription);
    console.log("🔔 New Device Subscribed");
  } else {
    console.log("✅ Device was already subscribed");
  }

  res.status(201).json({});
});
let allPosts = [];
// Upload media
app.post("/upload", upload.array("files"), (req, res) => {
  const files = req.files.map(f => ({
    src: `/uploads/${f.filename}`,
    type: f.mimetype
  }));
  res.json({ files });
});

// Serve index.html from public
app.get("/", (req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));

// WebSocket
io.on("connection", socket => {
  socket.emit("allPosts", allPosts);

  socket.on("newPost", post => {
  post.id = Date.now();        // unique ID
  post.likes = 0;              // default likes
  post.comments = [];          // default comments array
  post.created = Date.now();   // time created

  allPosts.unshift(post);      // store it
  io.emit("postAdded", post);  // notify clients new post exists


  const sender = post.postedBy; // ✅ sender identified

  const payload = JSON.stringify({
    title: "NEW POST FROM CAISEN HIGH",
    body: post.text.slice(0, 40) + (post.text.length > 40 ? "..." : "")
  });

  // ✅ Cleanup invalid subs & skip sender
  studentSubscriptions = studentSubscriptions.filter(sub => sub && sub.endpoint);

  studentSubscriptions
    .filter(sub => sub.endpoint !== sender) // ✅ no self-notifications
    .forEach(sub => {
      webpush.sendNotification(sub, payload).catch(() => {
        console.log("❌ Removing dead subscription");
        studentSubscriptions = studentSubscriptions.filter(s => s.endpoint !== sub.endpoint);
      });
    });
});
  socket.on("deletePost", id => {
    posts = posts.filter(p=>p.id!==id);
    io.emit("allPosts", posts);
  });

  socket.on("likePost", (id) => {
  const post = allPosts.find(p => p.id === id);
  if (!post) return;

  post.likes = (post.likes || 0) + 1;

  io.emit("postUpdated", post);
});

socket.on("newComment", ({ id, comment }) => {
  const post = allPosts.find(p => p.id === id);
  if (!post) return;

  if (!post.comments) post.comments = [];
  post.comments.push(comment);

  io.emit("postUpdated", post);
});

  socket.on("deleteComment", ({ id, index }) => {
  const post = allPosts.find(p => p.id === id);
  if (!post) return;

  if (post.comments && post.comments[index] != null) {
    post.comments.splice(index, 1);
  }

  io.emit("postUpdated", post);
});

}); // <<< VERY IMPORTANT — closes io.on("connection")

server.listen(3000, () => console.log("Server running on http://localhost:3000"));


