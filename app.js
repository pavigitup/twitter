const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3");
const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
  }
};
initializeDBAndServer();

//authentication
const authenticateToken = (req, res, next) => {
  let jwtToken;
  const authHeader = req.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        req.payload = payload;
        next();
      }
    });
  }
};

//Register
app.post("/register/", async (req, res) => {
  const { username, password, name, gender } = req.body;
  if (password.length < 6) {
    res.status(400);
    res.send("Password is too short");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    const checkRegister = `
    SELECT *
    FROM user
    WHERE username = '${username}'`;
    const user = await db.get(checkRegister);
    if (user === undefined) {
      const createUser = `
        INSERT INTO user( name, username, password, gender)
        VALUES(
            '${name}','${username}', '${hashedPassword}', '${gender}'
        );`;
      await db.run(createUser);
      res.status(200);
      res.send("User created successfully");
    } else {
      res.status(400);
      res.send("User already exists");
    }
  }
});

//login
app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const checkUser = `
    SELECT *
    FROM user
    WHERE username = '${username}';`;
  const user = await db.get(checkUser);
  console.log(user);

  if (user === undefined) {
    res.status(400);
    res.send("Invalid user");
  } else {
    const isPassword = await bcrypt.compare(password, user.password);
    if (isPassword === true) {
      const jwtToken = jwt.sign(user, "MY_SECRET_KEY");
      res.send({ jwtToken });
    } else {
      res.status(400);
      res.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (req, res) => {
  const { payload } = req;
  const { user_id, name, username, password, gender } = payload;
  const getLatestTweets = `
    SELECT username , tweet , tweet.date_time as dateTime
    FROM follower inner join tweet on tweet.user_id = follower.following_user_id inner join user on user.user_id =  follower.following_user_id
    WHERE follower.follower_user_id = ${user_id}
    ORDER BY date_time DESC
    LIMIT 4;`;
  const latestTweets = await db.all(getLatestTweets);
  res.send(latestTweets);
});

app.get("/user/following/", authenticateToken, async (req, res) => {
  const { payload } = req;
  const { user_id, name, username, password, gender } = payload;
  const getUsers = `
    SELECT name
    FROM follower inner join user on follower.following_user_id = user.user_id
    WHERE follower.follower_user_id = ${user_id};`;
  const users = await db.all(getUsers);
  res.send(users);
});

app.get("/user/followers/", authenticateToken, async (req, res) => {
  const { payload } = req;
  const { user_id, name, username, password, gender } = payload;
  const getUsers = `
    SELECT name
    FROM follower inner join user on follower.follower_user_id = user.user_id
    WHERE follower.following_user_id = ${user_id};`;
  const users = await db.all(getUsers);
  res.send(users);
});

app.get("/tweets/:tweetId/", authenticateToken, async (req, res) => {
  const { tweetId } = req.params;
  const { payload } = req;
  const { user_id, name, username, password, gender } = payload;
  const getTweet = `
  SELECT *
  FROM tweet
  WHERE tweet_id = ${tweetId}`;
  const tweet = await db.get(getTweet);
  console.log(tweet);

  const getFollowers = `
  SELECT *
  FROM follower inner join user on follower.following_user_id = user.user_id
  WHERE follower.follower_user_id = ${user_id}`;
  const followers = await db.all(getFollowers);
  console.log(followers);

  const result = followers.some(
    (each) => each.following_user_id === tweet.user_id
  );
  if (result === true) {
    const getTweets = `
      SELECT tweet.tweet, count(DISTINCT (like.like_id)) as likes, count( DISTINCT (reply.reply_id)) as replies, tweet.date_time as dateTime
      FROM tweet inner join reply on tweet.tweet_id = reply.tweet_id inner join like on tweet.tweet_id = like.tweet_id
      WHERE tweet.tweet_id = ${tweetId} and tweet.user_id = ${followers[0].user_id};`;
    const tweetDetails = await db.get(getTweets);
    res.send(tweetDetails);
  } else {
    res.status(401);
    res.send("Invalid Request");
  }
});

app.get("/tweets/:tweetId/likes/", authenticateToken, async (req, res) => {
  const { tweetId } = req.params;
  const { payload } = req;
  const { user_id, name, username, password, gender } = payload;
  const getTweet = `
  SELECT *
  FROM tweet
  WHERE tweet_id = ${tweetId}`;
  const tweet = await db.get(getTweet);
  const getLikes = `
  SELECT *
  FROM follower inner join tweet on follower.following_user_id = tweet.user_id inner join like on like.tweet_id = tweet.tweet_id inner join user on user.user_id = like.user_id
  WHERE follower.follower_user_id = ${user_id} and tweet.tweet_id = ${tweetId};`;
  const allLikes = await db.all(getLikes);
  const result = allLikes.some(
    (each) => each.following_user_id === tweet.user_id
  );
  if (result === true) {
    if (allLikes !== []) {
      let likes = [];
      for (let item in allLikes) {
        likes.push(allLikes[item].username);
      }
      res.send({ likes });
    }
  } else {
    res.status(401);
    res.send("Invalid Request");
  }
});

app.get("/tweets/:tweetId/replies/", authenticateToken, async (req, res) => {
  const { tweetId } = req.params;
  const { payload } = req;
  const { user_id, name, username, password, gender } = payload;
  const getTweet = `
  SELECT *
  FROM tweet
  WHERE tweet_id = ${tweetId}`;
  const tweet = await db.get(getTweet);
  const getReply = `
  SELECT *
  FROM follower inner join tweet on follower.following_user_id = tweet.user_id inner join reply on reply.tweet_id = tweet.tweet_id inner join user on user.user_id = reply.user_id
  WHERE follower.follower_user_id = ${user_id} and tweet.tweet_id = ${tweetId};`;
  const allReply = await db.all(getReply);
  console.log(allReply);
  const result = allReply.some(
    (each) => each.following_user_id === tweet.user_id
  );
  if (result === true) {
    if (allReply !== []) {
      let replies = [];
      for (let item in allReply) {
        const object = {
          name: allReply[item].name,
          reply: allReply[item].reply,
        };
        replies.push(object);
      }
      res.send({ replies });
    }
  } else {
    res.status(401);
    res.send("Invalid Request");
  }
});

app.get("/user/tweets/", authenticateToken, async (req, res) => {
  const { payload } = req;
  const { user_id, name, username, password, gender } = payload;
  const getTweets = `
         SELECT tweet.tweet, count(DISTINCT (like.like_id)) as likes, count( DISTINCT (reply.reply_id)) as replies, tweet.date_time as dateTime
         FROM user inner join tweet on user.user_id = tweet.user_id inner join like on tweet.tweet_id = like.tweet_id inner join reply on reply.tweet_id  = tweet.tweet_id
    WHERE user.user_id = ${user_id}
    GROUP BY tweet.tweet_id;`;
  const allTweetsList = await db.all(getTweets);
  res.send(allTweetsList);
});

app.post("/user/tweets/", authenticateToken, async (req, res) => {
  const { payload } = req;
  const { user_id, name, username, password, gender } = payload;
  const { tweet } = req.body;
  const createTweets = `
  INSERT INTO tweet(tweet)
  VALUES ('${tweet}')`;
  await db.run(createTweets);
  res.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authenticateToken, async (req, res) => {
  const { tweetId } = req.params;
  const { payload } = req;
  const { user_id, name, username, password, gender } = payload;
  const getTweet = `
  SELECT *
  FROM tweet
  WHERE tweet_id = ${tweetId}`;
  const tweet = await db.get(getTweet);
  console.log(tweet);

  const getReply = `
  SELECT *
  FROM follower inner join tweet on follower.following_user_id = tweet.user_id inner join reply on reply.tweet_id = tweet.tweet_id inner join user on user.user_id = reply.user_id
  WHERE follower.follower_user_id = ${user_id} and tweet.tweet_id = ${tweetId};`;
  const allReply = await db.all(getReply);
  const result = allReply.some(
    (each) => each.following_user_id === tweet.user_id
  );
  console.log(result);

  if (result === true) {
    const deleteTweets = `
  DELETE FROM tweet
  WHERE tweet_id = ${tweetId};`;
    await db.run(deleteTweets);
    res.send("Tweet Removed");
  } else {
    res.status(401);
    res.send("Invalid Request");
  }
});
module.exports = app;
