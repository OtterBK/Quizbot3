// 외부 모듈
const express = require("express");

// 로컬 모듈
const logger = require('../logger.js')('WebManager');

const app = express();
const PORT = 7777;

exports.strat_web = async() =>
{
  // 정적 파일 불러오기
  app.use(express.static(__dirname + "/public"));

  // 라우팅 정의
  app.get("/", (req, res) => 
  {
    res.sendFile(__dirname + "/index.html");
  });

  app.get("/privacy_policy", (req, res) => 
  {
    res.sendFile(__dirname + "/privacy_policy.html");
  });

  // 서버 실행
  app.listen(PORT, () => 
  {
    logger.info(`Web Server Listening Port: ${PORT}`);
  });
};

