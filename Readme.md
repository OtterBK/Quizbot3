
<h1 align="center"> DISCORD QUIZBOT </h1> 
<h3 align="center"> 디스코드 퀴즈봇 </h3> 
<p align="center">
  <a href="https://koreanbots.dev/bots/788060831660114012/">
    <img alt="Quizbot" title="Quizbot" src="https://github.com/user-attachments/assets/ad187303-0772-4ba0-823f-706df490cc13" width="450">
  </a>
</p>

<p align="center">
  디스코드에서 여러 사람들과 퀴즈를 풀며 경쟁하세요!
</p>

<p align="center">
  <a href="https://discord.com/oauth2/authorize?client_id=788060831660114012&permissions=2150681600&scope=bot">
    <img alt="Download on the App Store" title="App Store" src="http://img.shields.io/badge/-Discord-gray?style=for-the-badge&logo=discord&link=https://discord.com/application-directory/788060831660114012)](https://discord.com/application-directory/788060831660114012)]" width="140">
  </a>

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

## 📖 목차

- [📘 소개](#📘-소개)
- [📋 명령어](#📋-명령어)
- [🔧 기능](#🔧-기능)
  - [기본화면](#기본화면)
  - [서버원과 게임하기](#서버원과-게임하기)
  - [다른 서버와 경쟁하기](#다른-서버와-경쟁하기)
  - [퀴즈 만들기](#퀴즈-만들기)
  - [서버 설정 옵션 제공](#서버-설정-옵션-제공)
  - [공지/패치노트 확인](#공지패치노트-확인)
- [📑 봇 사용 예시](#📑-봇-사용-예시)
- [💻 개발자용-서버구축](#💻-개발자용-서버구축)

## 📘 소개

#### 🎮 디스코드 서버에서 즐길 수 있는 퀴즈 봇입니다.

- 디스코드에서 친구들 또는 다른 서버들과 퀴즈 대결을 펼쳐보세요!  
  노래 맞추기, 그림 퀴즈 등 다양한 퀴즈가 제공되며, 유저가 직접 퀴즈를 제작하고 공유할 수 있습니다.

- 퀴즈봇은 디스코드 공식 인증된 봇으로, 24시간 서비스를 제공하고 있습니다.  
  퀴즈봇을 사용하고 싶다면 아래 버튼을 눌러 디스코드 서버에 초대해 보세요.

<p align="center">
  <a href="https://koreanbots.dev/bots/788060831660114012">
    <img alt="퀴즈봇 초대" title="퀴즈봇 초대하기" src="https://cdn2.steamgriddb.com/thumb/1974a767627527a2f88ea3f2818676d7.jpg" width="140">
  </a>
</p>

<p align="center">
  <a href="https://koreanbots.dev/bots/788060831660114012" style="font-weight:bold; text-decoration:none;">
    🎯 퀴즈봇 초대하기
  </a>
</p>

## 📋 명령어

### 🎮 기본 명령어

| 명령어         | 설명                                          | 사용 예시     |
|----------------|-----------------------------------------------|---------------|
| `/퀴즈`        | 퀴즈봇의 메인 메뉴를 표시합니다.               | `/퀴즈`       |
| `/quiz`        | 퀴즈봇의 메인 메뉴를 영어로 표시합니다.        | `/quiz`       |
| `/퀴즈만들기`   | 퀴즈 제작 메뉴를 불러옵니다.                  | `/퀴즈만들기` |
| `/퀴즈정리`     | 현재 서버에서 진행 중인 모든 퀴즈를 정리합니다. | `/퀴즈정리`   |

---

### 🌐 멀티플레이 관련 명령어

| 명령어          | 설명                                          | 사용 예시     |
|-----------------|-----------------------------------------------|---------------|
| `/챗`           | 대전 중인 상대에게 메시지를 전송합니다.       | `/챗 ㅎㅇ`    |
| `/채팅전환`      | 전체 채팅 기능을 켜거나 끕니다.               | `/채팅전환`   |


## 🔧 기능

퀴즈봇은 NodeJS 기반으로 개발되었으며, DiscordJS 라이브러리를 사용합니다.
아래 내용에서 각 기능별 사용 예시를 확인하세요.

### [기본화면]
`/퀴즈` 명령어를 통해 요청할 수 있는 기본 화면(UI)입니다.

<img  src="https://github.com/user-attachments/assets/cbfe416d-94d9-4e2b-be3b-a53fa24b7fd2"  width="400"  height="500">

퀴즈봇의 모든 UI는 버튼을 눌러 상호작용 할 수 있습니다.
해당 UI를 기준으로 각 기능을 설명하겠습니다.

---

### [서버원과 게임하기]
🔖 서버원들과 함께 퀴즈를 풀며 경쟁할 수 있는 퀴즈봇의 가장 기본적인 기능으로 3가지 유형의 퀴즈를 제공합니다.

<div style="display: flex; justify-content: space-between;">
  <img src="https://github.com/user-attachments/assets/d20b1e00-65f8-4bf4-9cc9-dbc5d345df96" width="350" height="500">
  <img src="https://github.com/user-attachments/assets/c0027680-3740-462a-8558-f4f95bda3c83" width="350" height="500">
</div>
<div style="display: flex; justify-content: space-between;">
  <img src="https://github.com/user-attachments/assets/0c7c76e4-6f05-467b-a6a8-576311355fdc" width="350" height="500">
  <img src="https://github.com/user-attachments/assets/e7350e14-3e50-4850-9607-e74347901b8e" width="350" height="500">
</div>

* 공식 퀴즈: 개발자가 미리 제작해둔 퀴즈들로, 장기 지원되는 퀴즈들입니다.

* 유저 제작 퀴즈: 퀴즈봇의 유저분들이 `퀴즈만들기` 기능을 통해 직접 제작한 퀴즈들입니다.

* 오마카세 퀴즈: 퀴즈 장르나, 원하는 퀴즈들을 선택하면 퀴즈 봇이 그 중에서 무작위로 일정 수의 퀴즈를 제출하는 방식입니다.

---

### [다른 서버와 경쟁하기]
🔖 서버원들과 협력해 다른 서버와 퀴즈 대결을 진행하는 모드로, 멀티플레이 퀴즈라고 부릅니다.

<div style="display: flex; justify-content: space-between;">
  <img src="https://github.com/user-attachments/assets/97bd6c23-de08-4475-9079-ee7d6576edb2" width="350" height="500">
  <img src="https://github.com/user-attachments/assets/57500cdd-65e1-48c3-8131-4343eb6c72c2" width="350" height="500">
</div>

참여자는 참가하고 싶은 로비를 선택해 입장합니다.
방장(호스트)은 오마카세 퀴즈와 동일하게 원하는 장르나, 다수의 퀴즈들을 선택하고 게임을 시작하여 경쟁을 시작할 수 있습니다.

* 멀티플레이 퀴즈에서 승리하고 MMR 점수를 획득하여 순위표에 이름을 올려보세요!
* `/챗` 명령어로 대전 상대와의 대화도 가능합니다.

---

### [퀴즈 만들기]
🔖 직접 자신만의 퀴즈를 제작하고 모두와 공유할 수 있는 기능입니다.
🔖 `/퀴즈만들기` 명령어를 입력하여 디스코드에서 퀴즈 제작 화면을 요청할 수 있습니다.

<div style="display: flex; justify-content: space-between;">
  <img src="https://github.com/user-attachments/assets/565360a8-2681-4640-b816-412e26a99085" width="350" height="500">
  <img src="https://github.com/user-attachments/assets/416da5f6-e67e-4e46-aa6e-af71167d4bdc" width="350" height="500">
</div>
<div style="display: flex; justify-content: space-between;">
  <img src="https://github.com/user-attachments/assets/176e26ae-5c37-4ca4-b661-de2d66cd1bf1" width="350" height="500">
  <img src="https://github.com/user-attachments/assets/2e5d4ff7-4ae2-4a21-a22e-531565df7dac" width="350" height="500">
</div>
  <img src="https://github.com/user-attachments/assets/0bc5df2d-184e-4a2b-8b42-03aee7c5e51a" width="350" height="500">
  <img src="https://github.com/user-attachments/assets/a6c25729-1e71-48d4-baea-906000004589" width="350" height="500">
</div>

예시 이미지와 같이 다양한 유형의 퀴즈 제작이 가능하며, 제작한 퀴즈를 [공개]로 지정하여 [유저 제작 퀴즈] 목록에 등록할 수 있습니다.

---

### [서버 설정 옵션 제공]
🔖 서버 설정 옵션을 통해 노래 재생 시간, 점수 채점 방식, 힌트 요청 방식 등을 조정할 수 있습니다.

</div>
  <img src="https://github.com/user-attachments/assets/60712ebc-cf4f-436c-b600-6f27da0b4f4c" width="350" height="500">
  <img src="https://github.com/user-attachments/assets/d459afe8-3c3d-4818-8de6-d5307a920d25" width="350" height="500">
</div>

---

### [공지/패치노트 확인]
🔖 새로운 기능이나 업데이트를 실시간으로 공지사항에서 확인할 수 있습니다.

</div>
  <img src="https://github.com/user-attachments/assets/bdd368b1-58a1-4154-9f3f-c705b1301183" width="350" height="500">
  <img src="https://github.com/user-attachments/assets/bf3003e7-5fb2-4f85-bfbf-981f638d7e46" width="350" height="500">
</div>

## 📑 봇 사용 예시

작성 중

## 💻 개발자용-서버구축

작성 중

- Follow the [React Native Guide](https://facebook.github.io/react-native/docs/getting-started.html) for getting started building a project with native code. **A Mac is required if you wish to develop for iOS.**
- Clone or download the repo
- `yarn` to install dependencies
- `yarn run link` to link react-native dependencies
- `yarn start:ios` to start the packager and run the app in the iOS simulator (`yarn start:ios:logger` will boot the application with [redux-logger](<https://github.com/evgenyrodionov/redux-logger>))
- `yarn start:android` to start the packager and run the app in the the Android device/emulator (`yarn start:android:logger` will boot the application with [redux-logger](https://github.com/evgenyrodionov/redux-logger))

Please take a look at the [contributing guidelines](./CONTRIBUTING.md) for a detailed process on how to build your application as well as troubleshooting information.

**Development Keys**: The `CLIENT_ID` and `CLIENT_SECRET` in `api/index.js` are for development purposes and do not represent the actual application keys. Feel free to use them or use a new set of keys by creating an [OAuth application](https://github.com/settings/applications/new) of your own. Set the "Authorization callback URL" to `gitpoint://welcome`.
