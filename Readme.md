<h1 align="center"> 🎉 DISCORD QUIZBOT 🎉 </h1> 
<h3 align="center">디스코드 퀴즈봇</h3> 

<p align="center">
  <a href="https://koreanbots.dev/bots/788060831660114012/">
    <img alt="Quizbot" title="Quizbot" src="https://github.com/user-attachments/assets/ad187303-0772-4ba0-823f-706df490cc13" width="450">
  </a>
</p>

<p align="center"><b>디스코드에서 여러 사람들과 퀴즈를 풀며 경쟁하세요!</b></p>

<p align="center">
  <a href="https://discord.com/oauth2/authorize?client_id=788060831660114012&permissions=2150681600&scope=bot">
    <img alt="Invite Discord Quiz Bot" title="Invite" src="http://img.shields.io/badge/-Invite%20QuizBot-blue?style=for-the-badge&logo=discord&link=https://discord.com/application-directory/788060831660114012)](https://discord.com/application-directory/788060831660114012)]" width="160">
  </a>
</p>

---

## 📖 목차

- [📘 **소개**](#-소개)
- [📋 **명령어**](#-명령어)
  - [🎮 기본 명령어](#-기본-명령어)
  - [🌐 멀티플레이 관련 명령어](#-멀티플레이-관련-명령어)
- [**🔧 기능**](#-기능)
  - [기본화면](#기본화면)
  - [서버원과 게임하기](#서버원과-게임하기)
  - [다른 서버와 경쟁하기](#다른-서버와-경쟁하기)
  - [퀴즈 만들기](#퀴즈-만들기)
  - [서버 설정 옵션 제공](#서버-설정-옵션-제공)
  - [공지/패치노트 확인](#공지패치노트-확인)
- [📑 **봇 사용 예시**](#-봇-사용-예시)
- [💻 **개발자용-서버구축**](#-개발자용-서버구축)

---

## 📘 소개

#### 🎮 **디스코드 서버에서 즐길 수 있는 최고의 퀴즈 봇!**

- 다양한 주제와 형식의 퀴즈로 친구들 또는 다른 서버들과 대결하세요!  
  노래 맞추기, 그림 퀴즈 등 다채로운 퀴즈가 제공되며, 직접 퀴즈를 제작하고 공유할 수 있습니다.

- **공식 인증된 디스코드 봇**으로, 24시간 서비스를 제공하고 있습니다.  
  아래 버튼을 눌러 디스코드 서버에 퀴즈봇을 초대해 보세요.

<p align="center">
  <a href="https://koreanbots.dev/bots/788060831660114012">
    <img alt="퀴즈봇 초대" title="퀴즈봇 초대하기" src="https://cdn2.steamgriddb.com/thumb/1974a767627527a2f88ea3f2818676d7.jpg" width="150">
  </a>
</p>

<p align="center">
  <a href="https://koreanbots.dev/bots/788060831660114012" style="font-weight:bold; text-decoration:none;">
    🎯 퀴즈봇 초대하기
  </a>
</p>

---

## 📋 명령어

### 🎮 **기본 명령어**

| 명령어         | 설명                                          | 사용 예시     |
|----------------|-----------------------------------------------|---------------|
| `/퀴즈`        | 퀴즈봇의 메인 메뉴를 표시합니다.               | `/퀴즈`       |
| `/quiz`        | 퀴즈봇의 메인 메뉴를 영어로 표시합니다.        | `/quiz`       |
| `/퀴즈만들기`   | 퀴즈 제작 메뉴를 불러옵니다.                  | `/퀴즈만들기` |
| `/퀴즈정리`     | 현재 서버에서 진행 중인 모든 퀴즈를 정리합니다. | `/퀴즈정리`   |


### 🌐 **멀티플레이 관련 명령어**

| 명령어          | 설명                                          | 사용 예시     |
|-----------------|-----------------------------------------------|---------------|
| `/챗`           | 대전 중인 상대에게 메시지를 전송합니다.       | `/챗 ㅎㅇ`    |
| `/채팅전환`      | 전체 채팅 기능을 켜거나 끕니다.               | `/채팅전환`   |


## 🔧 기능

퀴즈봇은 **NodeJS** 기반으로 개발되었으며, **DiscordJS** 라이브러리를 사용합니다.  
아래 기능을 통해 퀴즈봇을 최대한 활용해 보세요!

---

### [기본화면]  
🔖 `/퀴즈` 명령어를 통해 요청할 수 있는 기본 화면입니다.

<p align="left">
  <img src="https://github.com/user-attachments/assets/cbfe416d-94d9-4e2b-be3b-a53fa24b7fd2" width="400" height="500">
</p>

퀴즈봇의 모든 UI는 버튼을 눌러 상호작용할 수 있습니다.  
해당 UI를 기준으로 각 기능을 설명하겠습니다.

---

### [서버원과 게임하기]  
🔖 서버원들과 함께 퀴즈를 풀며 경쟁할 수 있는 퀴즈봇의 가장 기본적인 기능입니다.

<details>
  <summary>
    <a>📷 [스냅샷 보기]</a>
  </summary>
  
  <div style="display: flex; justify-content: space-between;" align="left">
    <img src="https://github.com/user-attachments/assets/d20b1e00-65f8-4bf4-9cc9-dbc5d345df96" width="330" height="450">
    <img src="https://github.com/user-attachments/assets/c0027680-3740-462a-8558-f4f95bda3c83" width="330" height="450">
  </div>

  <div style="display: flex; justify-content: space-between;" align="left">
    <img src="https://github.com/user-attachments/assets/0c7c76e4-6f05-467b-a6a8-576311355fdc" width="330" height="500">
    <img src="https://github.com/user-attachments/assets/e7350e14-3e50-4850-9607-e74347901b8e" width="330" height="500">
  </div>
</details>

* **공식 퀴즈**: 개발자가 미리 제작해둔 퀴즈들로, 장기 지원되는 퀴즈들입니다.
* **유저 제작 퀴즈**: 유저분들이 `퀴즈만들기` 기능을 통해 직접 제작한 퀴즈입니다.
* **오마카세 퀴즈**: 퀴즈 장르나 퀴즈 목록을 선택하면 퀴즈봇이 무작위로 퀴즈를 제출합니다.

---

### [다른 서버와 경쟁하기]  
🔖 서버원들과 협력해 다른 서버와 퀴즈 대결을 진행하는 **멀티플레이 퀴즈 모드**입니다.

<details>
  <summary>
    <a>📷 [스냅샷 보기]</a>
  </summary>
  <div style="display: flex; justify-content: space-between;" align="left">
    <img src="https://github.com/user-attachments/assets/97bd6c23-de08-4475-9079-ee7d6576edb2" width="330" height="450">
    <img src="https://github.com/user-attachments/assets/57500cdd-65e1-48c3-8131-4343eb6c72c2" width="330" height="450">
  </div>
</details>

참여자는 원하는 로비에 입장한 후 [준비] 버튼을 클릭합니다.
호스트는 오마카세 퀴즈와 동일하게 원하는 퀴즈 장르나 퀴즈 목록을 선택하고 [시작] 버튼을 클릭하여 게임을 시작합니다.

* **MMR 점수**를 획득하여 순위표에 서버 이름을 올려보세요!
* `/챗` 명령어로 대전 상대와의 대화도 가능합니다.

---

### [퀴즈 만들기]  
🔖 **직접 퀴즈를 제작**하고 다른 유저들과 공유할 수 있습니다.  
🔖 `/퀴즈만들기` 명령어를 입력하여 퀴즈 제작 메뉴를 호출하세요.

<details>
  <summary>
    <a>📷 [스냅샷 보기]</a>
  </summary>
  
  <div style="display: flex; justify-content: space-between;" align="left">
    <img src="https://github.com/user-attachments/assets/565360a8-2681-4640-b816-412e26a99085" width="330" height="450">
    <img src="https://github.com/user-attachments/assets/416da5f6-e67e-4e46-aa6e-af71167d4bdc" width="330" height="450">
  </div>

  <div style="display: flex; justify-content: space-between;" align="left">
    <img src="https://github.com/user-attachments/assets/176e26ae-5c37-4ca4-b661-de2d66cd1bf1" width="330" height="450">
    <img src="https://github.com/user-attachments/assets/2e5d4ff7-4ae2-4a21-a22e-531565df7dac" width="330" height="450">
  </div>

  <div style="display: flex; justify-content: space-between;" align="left">
    <img src="https://github.com/user-attachments/assets/0bc5df2d-184e-4a2b-8b42-03aee7c5e51a" width="350" height="500">
    <img src="https://github.com/user-attachments/assets/a6c25729-1e71-48d4-baea-906000004589" width="350" height="500">
  </div>
</details>

* 이미지처럼 수 많은 유형의 문제 제작이 가능합니다.
* 제작한 퀴즈는 **공개 설정**을 통해 유저 제작 퀴즈 목록에 등록할 수 있습니다.

---

### [서버 설정 옵션 제공]  
🔖 노래 재생 시간, 점수 채점 방식, 힌트 요청 방식 등 다양한 **서버 설정 옵션**을 제공합니다.

<details>
  <summary>
    <a>📷 [스냅샷 보기]</a>
  </summary>
  
  <div style="display: flex; justify-content: space-between;" align="left">
    <img src="https://github.com/user-attachments/assets/60712ebc-cf4f-436c-b600-6f27da0b4f4c" width="330" height="450">
    <img src="https://github.com/user-attachments/assets/d459afe8-3c3d-4818-8de6-d5307a920d25" width="330" height="450">
  </div>
</details>

---

### [공지/패치노트 확인]  
🔖 새로운 기능이나 업데이트 소식을 **공지사항**에서 확인하세요!

<details>
  <summary>
    <a>📷 [스냅샷 보기]</a>
  </summary>
  
  <div style="display: flex; justify-content: space-between;" align="left">
    <img src="https://github.com/user-attachments/assets/bdd368b1-58a1-4154-9f3f-c705b1301183" width="330" height="450">
    <img src="https://github.com/user-attachments/assets/bf3003e7-5fb2-4f85-bfbf-981f638d7e46" width="330" height="450">
  </div>
</details>

---

## 📑 봇 사용 예시  
🚧 **작성 중**

---

## 💻 개발자용-서버구축  

<details>
  <summary>
    📋 [시스템 요구사항]
  </summary>

| 요구사항          | 세부 내용                                                                                      |
|------------------|------------------------------------------------------------------------------------------------|
| 🖥 **운영체제**    | Ubuntu 22.04 LTS                                                                               |
| 🧠 **vCPU**        | 1코어                                             |
| 🛠️ **메모리**      | 최소 4GB                                                             |
| 💾 **디스크 공간**  | 최소 20GB HDD                                                                                                                             |
| 📦 **필수 패키지** | Net-tools, Git, Node.js (16, 17, 18 중 선택), PostgreSQL 14                                    |
| 🗄️ **데이터베이스** | PostgreSQL 14 (데이터베이스 및 사용자 생성 필요)                                                |
| ⏲️ **크론 스케줄러** | (옵션) 서버 자동 시작/정지 및 백업 스케줄링 가능                                                |
| 🧹 **스왑 메모리**   | (옵션) 지정한 크기의 스왑 메모리 설정 가능                                                     |

</details>

---
<details>
  <summary>
    📦 [자동 설치 방법]
  </summary>


### Quizbot3 자동 설치 가이드

**Ubuntu 22.04 LTS**에서만 검증된 설치 방법입니다.

---

### 설치 단계:

1. **Quizbot 자동 설치 스크립트를 홈 경로에 다운로드합니다**.  
   ```bash
   wget https://raw.githubusercontent.com/OtterBK/Quizbot3/refs/heads/develop/auto_script/setup_quizbot3.sh
   ```
   [setup_quizbot3.sh 다운로드](https://github.com/OtterBK/Quizbot3/blob/develop/auto_script/setup_quizbot3.sh)

2. **DB 스키마 구성을 위한 `base.sql`을 홈 경로에 다운로드합니다**.  
   ```bash
   wget https://raw.githubusercontent.com/OtterBK/Quizbot3/refs/heads/master/auto_script/db_backup/base.sql
   ```
   [base.sql 다운로드](https://github.com/OtterBK/Quizbot3/blob/master/auto_script/db_backup/base.sql)
   

3. **퀴즈봇을 설치할 디렉터리를 홈 경로에 생성합니다**.
   ```bash
   mkdir /home/ubuntu/quizbot3
   ```

4. **현재 디렉터리 구조는 다음과 같을 것입니다**:
	<br>
   ![디렉터리 구조](https://github.com/user-attachments/assets/47fe14a9-6a7f-4d13-ace2-561e899f21de)

5. **다음 명령어를 실행하여 퀴즈봇을 설치합니다**:
   ```bash
   sudo sh /home/ubuntu/setup_quizbot3.sh --install-path=/home/ubuntu/quizbot3/ --node=18 --cron --dump=/home/ubuntu/base.sql --swap=8G
   ```

6. **스크립트 실행이 완료되면 Quizbot3가 성공적으로 설치됩니다**:
   ![설치 완료](https://github.com/user-attachments/assets/af803c4f-cd53-4402-a1e0-233c5b8dee8a)  
   ![Quizbot3 설치 확인](https://github.com/user-attachments/assets/3943c9bf-a2d7-4496-914c-30679c99ce41)

### 스크립트 옵션 설명

 * **설치 경로 설정** (`--install-path`):  
   Quizbot3를 설치할 경로를 지정합니다.
   
   ```bash
   --install-path=/your/install/directory
   ```

 * **Node.js 버전 선택** (`--node`):  
   기본적으로 Node.js 18 버전이 설치되며, 16 또는 17 버전도 선택할 수 있습니다.
   
   ```bash
   --node=16  # Node.js 16 설치
   ```

 * **크론 스케줄러 설정** (`--cron` 옵션):  
   이 옵션을 통해 정기적으로 서버를 시작, 중지하거나 백업 등의 작업을 예약할 수 있습니다.
   
   ```bash
   --cron
   ```

 * **데이터베이스 백업 복원** (`--dump`):  
   기존 데이터베이스 백업 파일이 있을 경우 해당 경로를 지정하면 복원합니다.
   
   ```bash
   --dump=/path/to/base.sql
   ```

 * **스왑 메모리 설정** (`--swap`):  
   메모리가 부족할 때를 대비하여 추가적인 SWAP 메모리를 설정할 수 있습니다. 예를 들어 8GB의 SWAP을 설정하려면:
   
   ```bash
   --swap=8  # 8GB 스왑 설정
   ```

</details>

---

<details>
  <summary>
    📦 [수동 설치 방법]
  </summary>

### Quizbot3 수동 설치 가이드

### 1. 패키지 목록 업데이트

먼저 시스템 패키지를 최신 상태로 업데이트합니다.

```bash
sudo apt update -y
```

### 2. 필수 패키지 설치

다음 필수 패키지를 설치합니다.

- **Net-tools**: 네트워크 유틸리티 패키지
- **PostgreSQL 14**: 데이터베이스 시스템
- **Git**: 소스 코드 버전 관리 도구
- **Node.js**: 선택한 버전(16, 17, 18 중) 설치

```bash
# Net-tools 설치
sudo apt install net-tools -y

# PostgreSQL 14 설치
sudo apt install postgresql-14 -y

# Git 설치
sudo apt install git -y

# Node.js 설치 (기본 Node.js 18.x)
curl -sL https://deb.nodesource.com/setup_18.x | sudo bash -
sudo apt install nodejs -y
```

> **Node.js 버전 선택**: 다른 버전(16, 17)을 설치하려면 `setup_18.x` 부분을 `setup_16.x` 또는 `setup_17.x`로 변경하세요.

---

### 3. PostgreSQL 설정

#### 1) PostgreSQL 데이터베이스 및 사용자 생성

다음 명령어를 사용하여 PostgreSQL에서 `quizbot` 사용자를 생성하고, `quizbot3` 데이터베이스를 만듭니다.

```bash
# quizbot 사용자 생성
sudo -u postgres psql -c "CREATE USER quizbot WITH PASSWORD 'changepasswd';"

# quizbot3 데이터베이스 생성 (소유자는 quizbot)
sudo -u postgres psql -c "CREATE DATABASE quizbot3 WITH OWNER quizbot;"
```

#### 2) PostgreSQL 외부 접속 허용 설정 (옵션)

PostgreSQL이 외부에서도 접속 가능하도록 설정 파일을 수정합니다.

```bash
# PostgreSQL 설정 파일 수정 (외부 접속 허용)
sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" /etc/postgresql/14/main/postgresql.conf

# PostgreSQL 재시작
sudo service postgresql restart
```

---

### 4. Quizbot3 소스 코드 다운로드 및 설치

Git을 사용해 Quizbot3 소스 코드를 다운로드한 후, 필요한 Node.js 패키지를 설치합니다.

```bash
# 홈 디렉토리로 이동
cd ~

# Quizbot3 소스 코드 다운로드
git clone https://github.com/OtterBK/Quizbot3.git

# 설치 디렉토리로 이동
cd Quizbot3

# Node.js 패키지 설치
npm install
```

---

### 5. 크론 스케줄러 설정 (옵션)

서버 자동 시작/정지, 백업 등의 작업을 정기적으로 실행하려면 크론 스케줄러를 설정할 수 있습니다.

1) 크론을 설치하고 타임존을 `Asia/Seoul`로 설정합니다.

```bash
sudo apt install cron -y
sudo timedatectl set-timezone Asia/Seoul
sudo service cron start
```

2) 크론 작업 추가 예시:

- 매일 오전 9시, 오후 9시에 서버를 자동으로 시작 및 중지합니다.
- 매주 월요일 자정에 주간 플레이 기록을 리셋합니다.
- 매일 오전 8시, 오후 8시에 데이터베이스를 백업합니다.

```bash
# crontab 수정 (ubuntu 사용자 기준)
sudo crontab -e

# 다음 내용을 crontab 파일에 추가:
# CRON_TZ=Asia/Seoul
1 9,21 * * * /path/to/quizbot_start.sh
0 9,21 * * * /path/to/quizbot_stop.sh
0 0 * * 1 /path/to/reset_played_count_of_week.sh
0 8,20 * * * /path/to/backup_script.sh
```

---

### 6. 스왑 메모리 설정 (옵션)

메모리가 부족한 경우, 추가적인 스왑 메모리를 설정할 수 있습니다. 예를 들어, 8GB의 스왑을 설정하려면:

```bash
# 스왑 파일 생성
sudo fallocate -l 8G /swapfile

# 스왑 파일 권한 설정
sudo chmod 600 /swapfile

# 스왑 파일 활성화
sudo mkswap /swapfile
sudo swapon /swapfile

# 스왑 설정을 영구화
echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab

# 스왑 정보 확인
sudo swapon --show
```

---

### 7. 데이터베이스 백업 복원

기존 데이터베이스 백업 파일이 있는 경우, 다음 명령어를 사용하여 데이터를 복원할 수 있습니다.
기본적으론 auto_script/db_backup/base.sql 을 설치하시면 됩니다.

```bash
# 데이터베이스 복원 (백업 파일 경로는 변경 필요)
sudo -u postgres psql -d quizbot3 -f /path/to/base.sql
```

</details>

---
<details>
  <summary>
    🔌 [봇 실행 방법]
  </summary>

### Quizbot3 실행 가이드

### 1. private_config.json 설정

Quizbot3가 설치된 경로에서 `config/private_config.json` 파일을 엽니다.

```bash
vim /home/ubuntu/quizbot3/config/private_config.json
```

* DB 접속 계정의 기본 PASSWORD는 `changepasswd` 입니다.
* TOKEN, CLIENT_ID 값에는 Discord Developer Portal 에서 발급 받으신 토큰 및 ID를 넣어주세요.
* KOREANBOT_TOKEN은 생략 가능합니다.
* ADMIN_ID는 본인의 Discord User ID를 넣어주시면 됩니다.(생략 가능합니다.)

```plane
{
    "BOT": {
        "TOKEN" : "INPUT_BOT_TOKEN",
        "CLIENT_ID" : "INPUT_BOT_CLIENT_ID",
        "KOREANBOT_TOKEN" : "INPUT_KOREAN_BOT_TOKEN"
    },
    "DB": {
        "HOST" : "localhsot",
        "USER" : "quizbot",
        "PASSWORD" : "changepasswd",
        "DATABASE" : "quizbot3",
        "PORT" : "5432"
    },
    "ADMIN_ID": "INPUT_YOUR_DISCORD_USER_ID"
}

```

### 2. 봇 실행

봇 실행은 index.js를 실행하여 활성화 가능합니다.

```bash
node /home/ubuntu/quizbot3/index.js
```

</details>

---