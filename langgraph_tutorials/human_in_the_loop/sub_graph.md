# Sub Graph [link](https://docs.langchain.com/oss/javascript/langgraph/interrupts#using-with-subgraphs-called-as-functions)

1. ระวัง หากมีการ call function ภายใต้ node แล้วหาก node นั้นมีการ interrupt แล้วรอ resume
2. เพราะว่า พอ resume กลับมาแล้ว มันจะ re-execute node นั้นอีกรอบ แปลว่า function ที่ call จะถูกเรียกซ้ำ
3. ยกตัวอย่างเช่นการตัดบัตรเครดิต ใน node หากมี interrupt แล้ว resume มันจะตัดอีกรอบ
4. ดังนั้น ควรออกแบบ หรือเขียนให้รองรับการ วนกลับมาทำ node ใหม่ได้ เช่น เช็คว่าเคยทำไปแล้ว ก็ไม่ทำซ่้ำอีก

```ts
async function nodeInParentGraph(state: State) {
    someCode(); // <-- This will re-execute when resumed
    // Invoke a subgraph as a function.
    // The subgraph contains an `interrupt` call.
    const subgraphResult = await subgraph.invoke(someInput);
    // ...
}

async function nodeInSubgraph(state: State) {
    someOtherCode(); // <-- This will also re-execute when resumed
    const result = interrupt("What's your name?");
    // ...
}
```