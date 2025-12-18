import { adaptJihuToOpenAI } from "./openai-adapter.js";

const sample = {
  id: "test-id",
  object: "chat.completion",
  created: 1234567890,
  model: "minimax-m2",
  choices: [
    {
      index: 0,
      finish_reason: "stop",
      message: {
        role: "assistant",
        content: "hello world",
      },
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
  },
};

const adapted = adaptJihuToOpenAI(sample, "maas-minimax-m2");

console.log(JSON.stringify(adapted, null, 2));


