# Approve Or Reject [link](https://docs.langchain.com/oss/javascript/langgraph/interrupts#approve-or-reject)

- เป็นวิธีที่จะใช้ควบคุม การทำงานของ flow เช่น มีการสั่งให้โอนเงิน, ลบ DB มันจะใช้ควบคุมต่อจาก interrupt ว่าหากได้ response จาก interrupt มาประมาณนี้ ให้ไปไหนต่อ
- หลักการคือ เราจะใช้ Command({goto: ...})
- ตัวอย่าง code [full](./approve_reject.ts)

```ts
  const graphBuilder = new StateGraph(State)
    .addNode("approval", async (state) => { //approval node
      // Expose details so the caller can render them in a UI
      const decision = interrupt({ //throw interrupt to caller
        question: "Approve this action?",
        details: state.actionDetails,
      });

      console.log({decision});
      
      return new Command({ goto: decision ? "proceed" : "cancel" }); //หาก decision เป็น true จะให้ไป node proceed ถ้าไม่ก็ cancel
    }, { ends: ['proceed', 'cancel'] }) // เป็นการประกาศ ปลายทางที่สามารถ goto ทีเป็นไปได้ หรือที่จะให้ command สามารถเลือก goto ได้ว่าจะให้ไปที่ไหนต่อ ในที่นี้ก็จะมี proceed กับ cancel ที่เป็นไปได้
    .addNode("proceed", () => ({ status: "approved" }))
    .addNode("cancel", () => ({ status: "rejected" }))
    .addEdge(START, "approval")
    .addEdge("proceed", END)
    .addEdge("cancel", END);

    //... setup checkpointer

    const config = { configurable: { thread_id: "approval-123" } };
    const initial = await graph.invoke(
        { actionDetails: "Transfer $500", status: "pending" },
        config,
    );

    if("__interrupt__" in initial) {
        console.log(initial);
    }
    
    const resumed = await graph.invoke(new Command({ resume: true }), config); //ในที่นี้ ส่ง response เป็น true

```

# Update State
- ในคำสั่ง Command({goto: ...}) จะมี update อยู่ ให้ update state ได้ Command({goto: ..., update: {...stateProperties}})
- ข้อควรระวังสำหรับ การ return Command.goto และ update state หากมี function ทั่วๆไปที่เป็น node พยายามอย่า return ค่าเหมือนกับ state ของ graph ไม่งั้นจะ error ประมาณว่า ค่ามันทับกัน


# สำคัญ สำหรับ งาน production

[code](./approval_reject_real_world.ts)