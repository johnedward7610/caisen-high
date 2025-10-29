const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// File to store posts persistently
const POSTS_FILE = path.join(__dirname, "posts.json");

// Load posts from file, or start empty
let allPosts = [];
if (fs.existsSync(POSTS_FILE)) {
  try {
    allPosts = JSON.parse(fs.readFileSync(POSTS_FILE));
  } catch (err) {
    console.error("Error reading posts.json:", err);
  }
}

// Helper to save posts to file
function savePosts() {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(allPosts, null, 2));
}

// Multer for media uploads
const upload = multer({ dest: "uploads/" });

app.use(express.static("public")); 
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.json());

const webpush = require("web-push");

webpush.setVapidDetails(
  "mailto:school@app.com",
  "BJObTyA1yj3TpMXHLmXvwpx3sjk45HW9Ly3Cw0aKWwCUkxo_Uo0y3BoeOCvBv0uOZ8Mdskcb10r7RpycoeQ37OQ",
  "RlSpB2IyYGw7kjdeTbH8-uXrzuID6UJP_2MCVkvcmDc"
);

let studentSubscriptions = [];

// Save subscription route
app.post("/subscribe", (req, res) => {
  const subscription = req.body;
  if (!studentSubscriptions.find(sub => sub.endpoint === subscription.endpoint)) {
    studentSubscriptions.push(subscription);
    console.log("🔔 New Device Subscribed");
  } else console.log("✅ Device already subscribed");
  res.status(201).json({});
});

// Media upload route
app.post("/upload", upload.array("files"), (req, res) => {
  const files = req.files.map(f => ({
    src: `/uploads/${f.filename}`,
    type: f.mimetype
  }));
  res.json({ files });
});

app.get("/", (req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));

// ------------------- WebSocket -------------------
io.on("connection", socket => {
  socket.emit("allPosts", allPosts);

  socket.on("newPost", post => {
    post.id = Date.now();
    post.likes = 0;
    post.comments = [];
    post.created = Date.now();

    allPosts.unshift(post);
    savePosts(); // persist to disk
    io.emit("postAdded", post);

    // Notify other subscribers
    const sender = post.postedBy;
    const payload = JSON.stringify({
      title: "NEW POST FROM CAISEN HIGH",
      body: post.text.slice(0, 40) + (post.text.length > 40 ? "..." : "")
    });

    studentSubscriptions = studentSubscriptions.filter(sub => sub && sub.endpoint);
    studentSubscriptions
      .filter(sub => sub.endpoint !== sender)
      .forEach(sub => {
        webpush.sendNotification(sub, payload).catch(() => {
          console.log("❌ Removing dead subscription");
          studentSubscriptions = studentSubscriptions.filter(s => s.endpoint !== sub.endpoint);
        });
      });
  });

  socket.on("deletePost", id => {
    allPosts = allPosts.filter(p => p.id !== id);
    savePosts(); // persist deletion
    io.emit("allPosts", allPosts);
  });

  socket.on("likePost", (id) => {
    const post = allPosts.find(p => p.id === id);
    if (!post) return;
    post.likes = (post.likes || 0) + 1;
    savePosts();
    io.emit("postUpdated", post);
  });

  socket.on("newComment", ({ id, comment }) => {
    const post = allPosts.find(p => p.id === id);
    if (!post) return;
    post.comments = post.comments || [];
    post.comments.push(comment);
    savePosts();
    io.emit("postUpdated", post);
  });

  socket.on("deleteComment", ({ id, index }) => {
    const post = allPosts.find(p => p.id === id);
    if (!post || !post.comments || post.comments[index] == null) return;
    post.comments.splice(index, 1);
    savePosts();
    io.emit("postUpdated", post);
  });
});

server.listen(3000, () => console.log("Server running on http://localhost:3000"));
