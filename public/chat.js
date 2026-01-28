// ============================
// DOM
// ============================
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const micButton = document.getElementById("mic-button");
const typingIndicator = document.getElementById("typing-indicator");

// ============================
// STATE
// ============================
let isProcessing = false;
let foxAwake = false;

// ============================
// SYSTEM PROMPT (Fox personality)
// ============================
let chatHistory = JSON.parse(localStorage.getItem("chatHistory")) || [
	{
		role: "system",
		content: `
You are Fox 🦊.
You speak like a friendly, witty human.
You are playful, humorous, and warm.
Keep replies natural and casual.
Never say you are an AI.
`
	},
	{
		role: "assistant",
		content: "Hey! I'm Fox 🦊 — say my name if you need me."
	}
];

// ============================
// UTILS
// ============================
const saveHistory = () =>
	localStorage.setItem("chatHistory", JSON.stringify(chatHistory));

const timeNow = () =>
	new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const escapeHTML = (str) =>
	str.replace(/[&<>"']/g, (m) =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]),
	);

// ============================
// 🔊 TTS
// ============================
function stopSpeaking() {
	if (speechSynthesis.speaking) {
		speechSynthesis.cancel();
	}
}

function speak(text) {
	stopSpeaking();
	const u = new SpeechSynthesisUtterance(text);
	u.lang = "en-US"; // change to ar-SA if needed
	u.rate = 1.05;
	u.pitch = 1.1;
	speechSynthesis.speak(u);
}

// ============================
// 😄 Wake responses
// ============================
function randomWakeResponse() {
	const responses = [
		"Yeah? I'm here 😄",
		"Fox online 🦊",
		"Hey hey, talk to me!",
		"You called?",
		"Listening… go ahead!"
	];
	return responses[Math.floor(Math.random() * responses.length)];
}

// ============================
// UI
// ============================
function addMessage(role, text) {
	const el = document.createElement("div");
	el.className = `message ${role}-message`;

	el.innerHTML = `
		<div>${escapeHTML(text)}</div>
		${role === "assistant" ? `<button class="tts">🔊</button>` : ""}
		<time>${timeNow()}</time>
	`;

	if (role === "assistant") {
		el.querySelector(".tts").onclick = () => speak(text);
	}

	chatMessages.appendChild(el);
	chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Load history
chatHistory.forEach((m) => {
	if (m.role !== "system") addMessage(m.role, m.content);
});

// ============================
// 🎙 STT + Wake word
// ============================
let recognition;

if ("webkitSpeechRecognition" in window) {
	recognition = new webkitSpeechRecognition();
	recognition.lang = "en-US"; // or ar-SA
	recognition.continuous = true;
	recognition.interimResults = false;

	recognition.onresult = (event) => {
		const transcript =
			event.results[event.results.length - 1][0].transcript
				.trim()
				.toLowerCase();

		console.log("🎧 Heard:", transcript);

		// Cut Fox speech immediately
		stopSpeaking();

		// Wake word
		if (!foxAwake && transcript.includes("fox")) {
			foxAwake = true;
			const reply = randomWakeResponse();
			addMessage("assistant", reply);
			speak(reply);
			return;
		}

		// After wake: listen for command
		if (foxAwake) {
			foxAwake = false;
			const cleaned = transcript.replace("fox", "").trim();
			if (cleaned.length > 0) {
				userInput.value = cleaned;
				userInput.dispatchEvent(new Event("input"));
				sendMessage();
			}
		}
	};

	recognition.onerror = (e) => console.error("STT error:", e);

	micButton.onclick = () => {
		recognition.start();
		micButton.textContent = "🟢";
		micButton.title = "Fox is listening";
	};
} else {
	micButton.disabled = true;
	micButton.title = "Speech recognition not supported";
}

// ============================
// INPUT EVENTS
// ============================
userInput.addEventListener("input", () => {
	userInput.style.height = "auto";
	userInput.style.height = userInput.scrollHeight + "px";
});

userInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
});

sendButton.onclick = sendMessage;

// ============================
// CHAT LOGIC
// ============================
async function sendMessage() {
	const message = userInput.value.trim();
	if (!message || isProcessing) return;

	isProcessing = true;
	userInput.disabled = sendButton.disabled = true;

	addMessage("user", message);
	chatHistory.push({ role: "user", content: message });
	saveHistory();

	userInput.value = "";
	userInput.style.height = "auto";
	typingIndicator.classList.add("visible");

	let assistantText = "";

	const assistantEl = document.createElement("div");
	assistantEl.className = "message assistant-message";
	assistantEl.innerHTML = `
		<div></div>
		<button class="tts">🔊</button>
		<time>${timeNow()}</time>
	`;

	const textEl = assistantEl.querySelector("div");
	assistantEl.querySelector(".tts").onclick = () => speak(assistantText);
	chatMessages.appendChild(assistantEl);

	try {
		const res = await fetch("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ messages: chatHistory }),
		});

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const parts = buffer.split("\n\n");
			buffer = parts.pop();

			for (const part of parts) {
				if (!part.startsWith("data:")) continue;
				const data = part.replace("data:", "").trim();
				if (data === "[DONE]") break;

				const json = JSON.parse(data);
				const token =
					json.response || json.choices?.[0]?.delta?.content || "";

				if (token) {
					assistantText += token;
					textEl.textContent = assistantText;
					chatMessages.scrollTop = chatMessages.scrollHeight;
				}
			}
		}

		if (assistantText) {
			chatHistory.push({ role: "assistant", content: assistantText });
			saveHistory();
			speak(assistantText); // Fox talks automatically
		}
	} catch (e) {
		addMessage("assistant", "Oops… something went wrong 😅");
		console.error(e);
	} finally {
		typingIndicator.classList.remove("visible");
		isProcessing = false;
		userInput.disabled = sendButton.disabled = false;
		userInput.focus();
	}
}
