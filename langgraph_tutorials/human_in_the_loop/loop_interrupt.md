# Loop Interrupt [link](https://docs.langchain.com/oss/javascript/langgraph/interrupts#validating-human-input)

1. บางครั้ง เราก็ต้องการคำตอบจาก user จนกว่าจะถูกต้อง เราเลยอยากถามใหม่ซ้ำๆ
2. ก็สามารถใช้ while true

```ts
      while (true) {
        const answer = interrupt(prompt); // payload surfaces in result.__interrupt__
  
        if (typeof answer === "number" && answer > 0) {
          return { age: answer };
        }
  
        prompt = `'${answer}' is not a valid age. Please enter a positive number.`;
      }
```

```ts
  const first = await graph.invoke({ age: null }, config);
  console.log(first); // -> [{ value: "What is your age?", ... }]
  
  // Provide invalid data; the node re-prompts
  const retry = await graph.invoke(new Command({ resume: "thirty" }), config);
  console.log(retry); // -> [{ value: "'thirty' is not a valid age...", ... }] คำตอบนี้ไม่ใช่ number ก็ interrupt กลับมา
  
  // Provide valid data; loop exits and state updates
  const final = await graph.invoke(new Command({ resume: 30 }), config); //พอเราส่ง number > 0 ไปก็จะได้ return กลับมาอย่างถูกต้อง
  console.log(final.age); // -> 30
```