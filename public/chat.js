const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const micButton = document.getElementById("mic-button");
const typingIndicator = document.getElementById("typing-indicator");

let isProcessing = false;
let chatHistory = JSON.parse(localStorage.getItem("chatHistory")) || [
	{ role: "assistant", content: "Hello! How can I help you today?" },
];

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
function speak(text) {
	speechSynthesis.cancel();
	const utterance = new SpeechSynthesisUtterance(text);
	utterance.lang = "en-US"; // change to "ar-SA" if needed
	utterance.rate = 1;
	speechSynthesis.speak(utterance);
}

// ============================
// 🎙 STT
// ============================
let recognition;
if ("webkitSpeechRecognition" in window) {
	recognition = new webkitSpeechRecognition();
	recognition.lang = "en-US"; // or ar-SA
	recognition.continuous = false;
	recognition.interimResults = false;

	recognition.onresult = (event) => {
		userInput.value += event.results[0][0].transcript;
		userInput.dispatchEvent(new Event("input"));
	};

	recognition.onerror = (e) => {
		console.error("STT error:", e);
	};

	micButton.onclick = () => recognition.start();
} else {
	micButton.disabled = true;
	micButton.title = "Speech not supported";
}

// ============================
// UI
// ============================
function addMessage(role, text) {
	const el = document.createElement("div");
	el.className = `message ${role}-message`;

	el.innerHTML = `
		<div>${escapeHTML(text)}</div>
		${
			role === "assistant"
				? `<button class="tts" title="Read aloud">🔊</button>`
				: ""
		}
		<time>${timeNow()}</time>
	`;

	if (role === "assistant") {
		el.querySelector(".tts").onclick = () => speak(text);
	}

	chatMessages.appendChild(el);
	chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Load saved messages
chatHistory.forEach((m) => addMessage(m.role, m.content));

// ============================
// Events
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
// Chat logic
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
		<button class="tts" title="Read aloud">🔊</button>
		<time>${timeNow()}</time>
	`;

	const textEl = assistantEl.querySelector("div");
	const ttsBtn = assistantEl.querySelector(".tts");

	ttsBtn.onclick = () => speak(assistantText);

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
		}
	} catch (e) {
		addMessage("assistant", "⚠️ Error processing request.");
		console.error(e);
	} finally {
		typingIndicator.classList.remove("visible");
		isProcessing = false;
		userInput.disabled = sendButton.disabled = false;
		userInput.focus();
	}
}
