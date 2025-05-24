// app.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
require('dotenv').config(); // Load environment variables from .env file

// --- Constants & Configuration ---
const BOT_NAME = process.env.BOT_NAME;
// Pastikan MODEL_NAME di .env adalah model yang mendukung input multimodal (misalnya, "gemini-1.5-flash-latest", "gemini-1.5-pro-latest", atau "gemini-pro-vision")
// agar fitur pengiriman gambar berfungsi.
const MODEL_NAME = process.env.MODEL_NAME;
const MODEL_IDENTITY = process.env.MODEL_IDENTITY;
const COMPANY_NAME = process.env.COMPANY_NAME;
const API_KEY = process.env.GOOGLE_API_KEY;

// System Prompt (Persona) - Mirip dengan contoh Python
const SYSTEM_PROMPT = `Kamu adalah Asisten AI yang sangat membantu. Nama mu adalah ${BOT_NAME}. Kamu menggunakan model ${MODEL_IDENTITY}. Kamu diciptakan dan dikembangkan oleh ${COMPANY_NAME}. Jawab setiap pertanyaan dengan nada bersahabat dan informatif. Jika memungkinkan, berikan jawaban dalam format yang mudah dibaca (misalnya menggunakan poin atau paragraf pendek). Jangan mengakhiri percakapan dengan pertanyaan kecuali jika diperlukan untuk klarifikasi.`;
const INITIAL_BOT_MESSAGE = `Halo! Saya ${BOT_NAME}, asisten AI Anda. Ada yang bisa saya bantu hari ini?`;

// --- Validasi Konfigurasi ---
if (!API_KEY) {
    console.error("Error: GOOGLE_API_KEY tidak ditemukan di file .env!");
    process.exit(1); // Keluar jika API Key tidak ada
}

// --- Google AI Setup ---
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    // Konfigurasi keamanan (sesuaikan sesuai kebutuhan)
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
});

console.log(`Menggunakan model AI: ${MODEL_NAME}`);

// --- WhatsApp Client Setup ---
console.log("Menginisialisasi klien WhatsApp...");
const client = new Client({
    authStrategy: new LocalAuth(), // Menggunakan LocalAuth untuk menyimpan sesi
    webVersionCache: { // Coba gunakan versi web yang stabil
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    }
});

// Menyimpan riwayat chat per pengguna (in-memory)
// Key: chat ID (e.g., '6281234567890@c.us'), Value: Array history Google AI
const chatHistories = new Map();

// --- WhatsApp Event Handlers ---

client.on('qr', (qr) => {
    console.log('QR Code diterima, scan menggunakan WhatsApp di ponsel Anda:');
    qrcode.generate(qr, { small: true }); // Tampilkan QR code di terminal
});

client.on('authenticated', () => {
    console.log('Autentikasi berhasil!');
});

client.on('auth_failure', msg => {
    console.error('Autentikasi GAGAL:', msg);
    process.exit(1); // Keluar jika autentikasi gagal
});

client.on('ready', () => {
    console.log(`Klien WhatsApp siap! Terhubung sebagai ${BOT_NAME}.`);
});

client.on('message', async (message) => {
    const sender = message.from; // ID Pengirim (e.g., '6281234567890@c.us')
    const messageBody = message.body;

    // Log pesan yang diterima dengan lebih detail
    let receivedMessageLog = `Pesan diterima dari ${sender}: `;
    if (message.hasMedia) {
        receivedMessageLog += `[MEDIA]`;
        if (messageBody) {
            receivedMessageLog += ` Caption: "${messageBody}"`;
        }
    } else if (messageBody) {
        receivedMessageLog += `"${messageBody}"`;
    } else {
        receivedMessageLog += "[PESAN KOSONG atau TIPE TIDAK DIKENALI]";
    }
    console.log(receivedMessageLog);

    // Abaikan pesan jika tidak ada body teks DAN tidak ada media, atau itu status, atau dari bot sendiri
    if ((!messageBody && !message.hasMedia) || message.isStatus || message.fromMe) {
        console.log("Pesan diabaikan (tidak ada konten, status, atau dari bot sendiri).");
        return;
    }

    // Abaikan perintah spesifik jika tidak ingin diproses AI (contoh)
    if (messageBody && messageBody.toLowerCase() === '/ping') { // Pastikan messageBody ada sebelum toLowerCase
        await message.reply('Pong!');
        return;
    }

    // Dapatkan atau inisialisasi riwayat chat untuk pengguna ini
    let userHistory = chatHistories.get(sender);
    if (!userHistory) {
        console.log(`Memulai riwayat chat baru untuk ${sender}`);
        userHistory = [
            // Mulai dengan system prompt dan pesan pembuka
            { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
            { role: "model", parts: [{ text: INITIAL_BOT_MESSAGE }] }
        ];
        chatHistories.set(sender, userHistory);
    } else {
        console.log(`Melanjutkan riwayat chat untuk ${sender}. Panjang: ${userHistory.length}`);
    }

    // Persiapkan konteks waktu
    const now = new Date();
    const formattedDateTime = now.toLocaleString('id-ID', { // Format Bahasa Indonesia
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
    });

    let userMessagePartsForHistory = [];
    let promptPartsForAI = [];
    let logForAIMessage = ""; // Untuk logging apa yang dikirim ke AI

    // Kirim pesan ke AI
    try {
        if (message.hasMedia) {
            const media = await message.downloadMedia();
            if (media && media.mimetype.startsWith('image/')) {
                console.log(`Pesan dari ${sender} berisi gambar (${media.mimetype}). Caption: "${messageBody || ''}"`);
                const imageBase64 = media.data;
                const imageMimeType = media.mimetype;

                const caption = messageBody || ""; // Gunakan string kosong jika tidak ada caption

                // Untuk riwayat (input asli pengguna)
                if (caption) {
                    userMessagePartsForHistory.push({ text: caption });
                }
                userMessagePartsForHistory.push({ inlineData: { data: imageBase64, mimeType: imageMimeType } });

                // Untuk dikirim ke AI (dengan konteks)
                let textForAI = `(Info waktu saat ini: ${formattedDateTime})\n`;
                if (caption) {
                    textForAI += `Pesan Pengguna (beserta gambar):\n${caption}`;
                } else {
                    textForAI += `Pesan Pengguna (analisa gambar ini dan berikan deskripsi atau jawaban terkait):`;
                }
                promptPartsForAI.push({ text: textForAI });
                promptPartsForAI.push({ inlineData: { data: imageBase64, mimeType: imageMimeType } });
                logForAIMessage = `${textForAI.substring(0, 70)}... [PLUS IMAGE ${imageMimeType}]`;

            } else if (media) {
                // Media selain gambar
                console.log(`Pesan dari ${sender} berisi media non-gambar (${media.mimetype}). Ini akan diabaikan untuk pemrosesan AI.`);
                await message.reply("Maaf, saya hanya bisa memproses pesan teks dan gambar saat ini. Media lain belum didukung.");
                return;
            } else {
                // Gagal mengunduh media
                console.warn(`Gagal mengunduh media dari ${sender}.`);
                await message.reply("Maaf, ada masalah saat mengunduh media yang Anda kirim. Silakan coba lagi.");
                return;
            }
        } else if (messageBody) { // Pesan teks saja
            console.log(`Pesan teks diterima dari ${sender}: "${messageBody}"`);
            userMessagePartsForHistory.push({ text: messageBody });

            const textForAIWithContext = `(Info waktu saat ini: ${formattedDateTime})\nPesan Pengguna:\n${messageBody}`;
            promptPartsForAI.push({ text: textForAIWithContext });
            logForAIMessage = textForAIWithContext.substring(0, 100);
        } else {
            // Seharusnya tidak sampai sini karena sudah difilter di awal
            console.log("Pesan tanpa body teks dan tanpa media terdeteksi setelah filter awal, diabaikan.");
            return;
        }

        // Set status 'typing' di WhatsApp
        const chat = await client.getChatById(sender);
        await chat.sendStateTyping();

        const chatSession = model.startChat({
            history: userHistory,
            generationConfig: {
                // maxOutputTokens: 200, // Batasi panjang output jika perlu
            }
        });

        console.log(`Mengirim ke AI untuk ${sender}: "${logForAIMessage}..."`);

        const result = await chatSession.sendMessage(promptPartsForAI);
        const response = result.response;

        // Hentikan status 'typing'
        await chat.clearState();

        // Proses respons dari AI
        if (response) {
            const botReplyText = response.text();

            if (botReplyText) {
                console.log(`Balasan AI untuk ${sender}: "${botReplyText.substring(0, 100)}..."`);

                // Kirim balasan ke WhatsApp
                await client.sendMessage(sender, botReplyText);

                // Update riwayat chat
                // Tambahkan parts pesan pengguna (bisa teks, gambar, atau keduanya)
                userHistory.push({ role: "user", parts: userMessagePartsForHistory });
                userHistory.push({ role: "model", parts: [{ text: botReplyText }] });
                chatHistories.set(sender, userHistory); // Simpan riwayat yang diperbarui

            } else {
                // Handle jika AI tidak menghasilkan teks (mungkin karena filter keamanan internal)
                const blockReason = response.promptFeedback?.blockReason;
                const safetyRatings = response.promptFeedback?.safetyRatings;
                console.warn(`AI tidak menghasilkan teks untuk ${sender}. Alasan blokir: ${blockReason}`);
                console.warn(`Peringkat Keamanan: ${JSON.stringify(safetyRatings)}`);

                let replyMsg = "Maaf, saya tidak bisa memberikan respons untuk itu.";
                if (blockReason) {
                    replyMsg += ` (Alasan: ${blockReason})`;
                }
                await client.sendMessage(sender, replyMsg);
            }
        } else {
             console.error(`Respons AI kosong diterima untuk ${sender}.`);
             await client.sendMessage(sender, "Maaf, terjadi kesalahan saat memproses permintaan Anda.");
        }

    } catch (error) {
        console.error(`Error saat berinteraksi dengan AI atau WhatsApp untuk ${sender}:`, error);
        try {
            // Coba kirim pesan error ke pengguna
            const chat = await client.getChatById(sender);
            await chat.clearState(); // Hentikan 'typing' jika masih aktif
            await client.sendMessage(sender, `Waduh, sepertinya ada sedikit gangguan di sistem saya. Coba lagi nanti ya.\n\n(Detail error: ${error.message || 'Unknown error'})`);
        } catch (sendError) { // error saat mengirim pesan error
            console.error(`Gagal mengirim pesan error ke ${sender}:`, sendError);
        }
        
    }
});

// --- Inisialisasi Klien ---
console.log("Memulai koneksi ke WhatsApp...");
client.initialize().catch(err => {
    console.error("Gagal menginisialisasi klien WhatsApp:", err);
    process.exit(1);
});

// --- Penanganan Proses Exit ---
process.on('SIGINT', async () => {
    console.log("\nMenutup koneksi WhatsApp...");
    await client.destroy(); // Tutup koneksi dengan benar
    console.log("Koneksi ditutup. Selamat tinggal!");
    process.exit(0);
});
