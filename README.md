# Gemma Whatsapp Bot

Aplikasi untuk berbicara dengan model Gemma3. Aplikasi menggunakan Backend Google AI Studio.

## Prasyarat

Pastikan Anda telah menginstal **Node.js versi 20** dan **GIT**.  
Anda dapat mengunduhnya melalui tautan berikut:  

[Node.js v20.9.0](https://nodejs.org/id/blog/release/v20.9.0)

[GIT](https://git-scm.com/downloads)

## Instalasi

Buat file dengan nama **.env** kemudian salin kode di bawah ini:

```bash
GOOGLE_API_KEY=Your_Gemini_API_KEY
MODEL_NAME=gemma-3-27b-it
BOT_NAME=Nama_Bot_Yang_diinginkan
MODEL_IDENTITY="Nama model yang diinginkan"
COMPANY_NAME="Nama Perusahaan yang diinginkan"
```

Setelah Node.js dan GIT terinstal, jalankan perintah berikut di terminal pada folder yang telah ditentukan:

```bash
git clone https://github.com/Tredecillion-Team/gemma-wa-bot.git
cd gemma-wa-bot
npm init -y
npm install whatsapp-web.js @google/generative-ai dotenv qrcode-terminal
```

## Menjalankan Aplikasi

Untuk menjalankan aplikasi, gunakan perintah berikut:

```bash
node app.js
```
