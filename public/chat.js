const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

let isProcessing = false;
let chatHistory = JSON.parse(localStorage.getItem("chatHistory")) || [
	{
		role: "assistant",
		content: "Hello! How can I help you today?",
	},
];

// ---- helpers ----
const saveHistory = () =>
	localStorage.setItem("chatHistory", JSON.stringify(chatHistory));

const timeNow = () =>
	new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const escapeHTML = (str) =>
	str.replace(/[&<>"']/g, (m) =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]),
	);

// ---- UI ----
function addMessage(role, text) {
	const el = document.createElement("div");
	el.className = `message ${role}-message`;
	el.innerHTML = `
		<div>${escapeHTML(text)}</div>
		<time>${timeNow()}</time>
	`;
	chatMessages.appendChild(el);
	chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatHistory.forEach((m) => addMessage(m.role, m.content));

// ---- events ----
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

// ---- main ----
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
	assistantEl.innerHTML = `<div></div><time>${timeNow()}</time>`;
	const textEl = assistantEl.querySelector("div");
	chatMessages.appendChild(assistantEl);

	try {
		const res = await fetch("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ messages: chatHistory }),
		});

		if (!res.body) throw new Error("No response body");

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
	} catch (err) {
		addMessage("assistant", "⚠️ Something went wrong. Please try again.");
		console.error(err);
	} finally {
		typingIndicator.classList.remove("visible");
		isProcessing = false;
		userInput.disabled = sendButton.disabled = false;
		userInput.focus();
	}
}
