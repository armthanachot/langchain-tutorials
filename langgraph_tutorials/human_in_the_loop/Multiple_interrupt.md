# Multuple Interrupt [link](https://docs.langchain.com/oss/javascript/langgraph/interrupts#handling-multiple-interrupts)

- ถูกสร้างขึ้นมา เพื่อใช้สำหรับงานที่ทำงานแบบ pararell กัน
- ดังเช่นตัวอย่างใน [code](./multiple_interrupt.ts)
- ตัวหลักยังเป็นการใช้ function `interrupt` และ `resume` เหมือนเดิม
- เนื่องจากถูกสร้างงมาใช้กับงาน pararell สังเกตุได้ว่า ตอน START จะไม่มีการรอกัน ให้ทำงานตอน START พร้อมกันเลย
```ts
    .addEdge(START, "finance")
    .addEdge(START, "tech")
```
- และตอนจบ ต้องปิดให้ครบทุกตัว
```ts
    .addEdge("finance", END)
    .addEdge("tech", END)
```
- ต่อไป เรายัง เช็ค `__interrupt__` เหมือนเดิม ถ้ามี key ก็เท่ากับ มี `interrupt`
- สิ่งที่สำคัญคือ `interrupt id` เอาไว้ reference ไปหา `interrupt` นั้นๆ หากไม่สามารถส่ง id ได้ จะทำให้ interrupt ไม่ทำงาน แล้วอาจจะ error ได้
- `interrupt id` ได้จาก response จาก invoke แรก สามารถ loop เพื่อดึงออกมาได้
```ts
    for (const interrupt of out.__interrupt__ as { id: string, value: any }[]) {
        interrupID.push(interrupt.id);
    }
```
- จากนั้น ตอนที่เราจะ return เราจะ invoke โดยใช้ class `Command` และส่ง object ไปครั้งเดียวเลย
```ts
    resumeObject[interrupID[0]!] = { approved: true, comment: "อนุมัติ" };
    resumeObject[interrupID[1]!] = { approved: false, comment: "ไม่อนุมัติ" }; // mockup เพราะเรามีแค่ 2 interrupt จริงๆ ควรจะเป็นตามจำนวน interrupt ที่มี

    console.log(resumeObject);

    out = await graph.invoke(new Command({ resume: resumeObject }), config);
```
- ข้อควรระวัง!!! ทั้ง 2 function ที่เป็น node ห้าม return ค่าเหมือนกัน เพราะอาจจะทำให้ langchain สับสนได้ สังเกตุใน code จะแยกเป็น 2 แบบ คือ finance_approved และ tech_approved
```ts
const state = new StateSchema({
    taxId: z.string(),
    taxRate: z.number(),
    transactionId: z.string(),
    finance_approved: z.object({
        approved: z.boolean(),
        comment: z.string(),
    }),
    tech_approved: z.object({
        approved: z.boolean(),
        comment: z.string(),
    }),
})
```




