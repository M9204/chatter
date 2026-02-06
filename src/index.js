import { Ai } from '@cloudflare/ai';

export default {
  async fetch(request, env) {
    const ai = new Ai(env.AI);
    
    // Initialize D1 database if not exists
    await env.DB.exec(`
      CREATE TABLE IF NOT EXISTS user_data (
        user_id TEXT,
        habit TEXT,
        context TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS user_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        task TEXT,
        priority INTEGER DEFAULT 2,
        category TEXT,
        deadline DATETIME,
        completed BOOLEAN DEFAULT 0
      );
    `);

    if (request.method === 'POST') {
      const { message, userId } = await request.json();
      
      // Store conversation context
      await env.DB.prepare(
        'INSERT INTO user_data (user_id, habit, context) VALUES (?, ?, ?)'
      ).bind(userId, 'conversation', message).run();
      
      // Get user context for personalization
      const { results } = await env.DB.prepare(
        'SELECT * FROM user_data WHERE user_id = ? ORDER BY timestamp DESC LIMIT 10'
      ).bind(userId).all();
      
      const context = results.map(r => r.context).join('\n');
      
      // System prompt with engineering humor
      const systemPrompt = `You are Nexus, a witty engineering-focused assistant. 
      Be brief, practical, and slightly sarcastic. 
      User context: ${context}
      
      Response rules:
      1. Keep answers under 3 sentences
      2. Add engineering metaphors when possible
      3. For tasks: categorize as IMPORTANT, DELEGATE, or UNNECESSARY
      4. Be humorous but helpful
      5. If uncertain, ask one clarifying question
      
      User said: ${message}`;
      
      // Get AI response
      const aiResponse = await ai.run('@cf/meta/llama-2-7b-chat-int8', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ]
      });
      
      const reply = aiResponse.response || "Got it. Moving on.";
      
      // Check if response should be speech (contains commands/reminders)
      const isSpeech = message.toLowerCase().includes('remind') || 
                       message.toLowerCase().includes('schedule') ||
                       message.toLowerCase().includes('tell me');
      
      // Task extraction logic
      const taskRegex = /(?:create|add|schedule|remind me to)\s+(.+?)(?:\.|$)/i;
      const taskMatch = message.match(taskRegex);
      
      if (taskMatch) {
        const task = taskMatch[1];
        // Determine priority
        const priority = message.toLowerCase().includes('urgent') ? 1 : 
                        message.toLowerCase().includes('important') ? 2 : 3;
        
        await env.DB.prepare(
          'INSERT INTO user_tasks (user_id, task, priority) VALUES (?, ?, ?)'
        ).bind(userId, task, priority).run();
      }
      
      return new Response(JSON.stringify({
        reply: reply,
        speech: isSpeech,
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // GET request - retrieve tasks
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');
    
    if (userId) {
      const { results } = await env.DB.prepare(
        'SELECT * FROM user_tasks WHERE user_id = ? AND completed = 0 ORDER BY priority, deadline'
      ).bind(userId).all();
      
      return new Response(JSON.stringify({ tasks: results }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify({ status: 'Nexus API Active' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};