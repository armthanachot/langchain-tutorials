# Rule Of Interrupt [link](https://docs.langchain.com/oss/javascript/langgraph/interrupts#rules-of-interrupts)

เมื่อมีการ call interrupt ภายใน node, LangGraph จะ pause โดยการส่ง exceptoin เพื่อให้ runtime หยุดรอไว้ก่อน และ exception นี้ จะถูกส่งต่อไปยัง call stack และ runtime จะเป็นตัวดักจับ exception ไว้ และส่งสัญญาณให้ graph บันทึกสถานะปัจจุบันไว้ และรอรับข้อมูลจากภายนอก

เมื่อการทำงานกลับมาอีกครั้ง ระบบจะไม่ได้เริ่มจากบรรทัดที่ interrupt แต่จะเริ่มใหม่ตั้งแต่ node แรก ตั้งแต่แรก ดังนั้น จึงมีข้อควรระวังบางอย่าง ดังนี้ 

1. Do not wrap interrupt calls in try/catch
    - ถ้าเราดักโดยใช้ try-catch แปลว่า เราจะได้ error ตกไปใน catch แต่ว่า error จะไม่ถูกส่งกลับไปยัง Graph ดังนั้นอาจมีปัญหาเรื่องของการ set สถานะ
    - ถ้าจำเป็นต้องใช้ try-catch ให้ใช้วิธี re-throw คือ ให้ throw error ใน catch ออกไปด้วย ถึงจะไปถึง Graph
2. Do not reorder interrupt calls within a node
    - เป็นเรื่องปกติที่ใน 1 node จะมีหลาย interrupt แต่ การ resume มันจะจับคู่ตามลำดับ เป็นแบบ index-base (ลำดับที่ 0,1,2,...)
    - ห้ามมีการ reorder หรือสลับตำแหน่งของ interrupt
        ```ts
        // 🚩 แบบนี้พังแน่นอน!
        async function myNode(state) {
        if (state.userRole === 'admin') {
            // รอบแรกที่รัน state.userRole เป็น 'admin'
            // ตัวนี้จะกลายเป็น Index 0
            const val1 = interrupt("Confirm admin action"); 
        }

        // ตัวนี้จะกลายเป็น Index 1 (ถ้าเข้า if ข้างบน) 
        // หรือกลายเป็น Index 0 (ถ้าไม่เข้า if ข้างบน)
        const val2 = interrupt("Standard confirmation"); 
        }
        ```
        - รอบแรก userRole เป็น admin -> เกิด interrupt index 0
        - จากนั้น resume เราส่งค่ากลับมาเพื่อ confirm แต่ดันมีการแก้ state.userRole `ไม่เป็น` admin ก่อนที่จะ resume
        - จะทำให้ พอเรา run node นี้ ซ้ำ มันจะข้าม `if` แรกไป
        - จากนั้น LangGraph จะเอาค่าของ Admin action ที่เรา Resume มา ไปใส่ให้ `Standard confirmation` ทันที ทั้งๆที่มันควรเป็น `Confirm admin action` ที่ได้รับตรงนี้
        - วิธีแก้ที่ถูกต้อง คือ ทำให้เป็น `sequential Interrupts`
        ```ts
        async function nodeA(state: State) {
            // ✅ Good: interrupt calls happen in the same order every time
            const name = interrupt("What's your name?");
            const age = interrupt("What's your age?");
            const city = interrupt("What's your city?");

            return {
                name,
                age,
                city
            };
        }

        resume1 - name
        resume2 - age
        resume3 - city
        ```
    - อย่า loop interrupt
    ```ts
    const nodeA: GraphNode<typeof State> = async (state) => {
        // ❌ Bad: looping based on non-deterministic data
        // The number of interrupts changes between executions
        const results = [];
        for (const item of state.dynamicList || []) {  // List might change between runs
            const result = interrupt(`Approve ${item}?`);
            results.push(result);
        }

        return { results };
    }
    ```
    - อย่า return Complex Value ทั้งนี้ ขึ้นอยู่กับ checkpointer ด้วย แต่ทาง Langchain แนะนำให้ return simple value เช่น `Json`, `type แบบทั่วไป` หรือ `Dictionary`
    ```ts
    const nodeA: GraphNode<typeof State> = async (state) => {
        // ✅ Good: passing simple types that are serializable
        const name = interrupt("What's your name?");
        const count = interrupt(42);
        const approved = interrupt(true);
        const response = interrupt({
            question: "Enter user details",
            fields: ["name", "email", "age"],
            currentValues: state.user || {}
        });

        return { name, count, approved, response };
    }
    ```

    ตัวอย่างซับซ้อน (function/class)
    ```ts
    function validateInput(value: string): boolean {
        return value.length > 0;
    }

    const nodeA: GraphNode<typeof State> = async (state) => {
    // ❌ Bad: passing a function to interrupt
    // The function cannot be serialized
    const response = interrupt({
        question: "What's your name?",
        validator: validateInput  // This will fail
    });
    return { name: response };
    }
    ```

    ```ts
    class DataProcessor {
        constructor(private config: any) {}
    }

    const nodeA: GraphNode<typeof State> = async (state) => {
    const processor = new DataProcessor({ mode: "strict" });

    // ❌ Bad: passing a class instance to interrupt
    // The instance cannot be serialized
    const response = interrupt({
        question: "Enter data to process",
        processor: processor  // This will fail
    });
    return { result: response };
    }
    ```
    - Idempotency คือ การทำซ้ำกี่ครั้ง ต้องได้ผลลัพธ์ออกมาเหมือนเดิม ไม่งั้น ก็อาจจะได้ขยะเต็มไปหมด เนื่องจากตอนที่เรา `Resume` มันจะเริ่มทำใหม่หมด ยกตัวอย่างเช่น
        - แบบนี้ แปลว่า มันจะได้ค่าใหม่ทุกครั้ง  ❌
        ```ts
            const nodeA: GraphNode<typeof State> = async (state) => {
            // ❌ Bad: creating a new record before interrupt
            // This will create duplicate records on each resume
            const auditId = await db.createAuditLog({
                userId: state.userId,
                action: "pending_approval",
                timestamp: new Date()
            });

            const approved = interrupt("Approve this change?");

            return { approved, auditId };
            }
        ```
        - แบบนี้ ค่าก็อาจจะซ้ำ ❌
        ```ts
            const nodeA: GraphNode<typeof State> = async (state) => {
            // ❌ Bad: appending to an array before interrupt
            // This will add duplicate entries on each resume
            await db.appendToHistory(state.userId, "approval_requested");

            const approved = interrupt("Approve this change?");

            return { approved };
            }
        ```
        - ทำ UPSERT ✅
        ```ts
            const nodeA: GraphNode<typeof State> = async (state) => {
            // ✅ Good: using upsert operation which is idempotent
            // Running this multiple times will have the same result
            await db.upsertUser({
                userId: state.userId,
                status: "pending_approval"
            });

            const approved = interrupt("Approve this change?");

            return { approved };
            }
        ```
        - ทำ side effect หลังจาก interrupt แล้ว resume ✅
        ```ts
            const nodeA: GraphNode<typeof State> = async (state) => {
            // ✅ Good: placing side effect after the interrupt
            // This ensures it only runs once after approval is received
            const approved = interrupt("Approve this change?");

            if (approved) {
                await db.createAuditLog({
                userId: state.userId,
                action: "approved"
                });
            }

            return { approved };
            }
        ```
        - ทำ node แยก เพราะตาม pipeline มันก็จะไหลตาม route ที่วางไว้ให้อยู่แล้ว
        ```ts
            const approvalNode: GraphNode<typeof State> = async (state) => {
            // ✅ Good: only handling the interrupt in this node
            const approved = interrupt("Approve this change?");

            return { approved };
            }

            const notificationNode: GraphNode<typeof State> = async (state) => {
            // ✅ Good: side effect happens in a separate node
            // This runs after approval, so it only executes once
            if (state.approved) {
                await sendNotification({
                userId: state.userId,
                status: "approved",
                });
            }

            return state;
            }
        ```
