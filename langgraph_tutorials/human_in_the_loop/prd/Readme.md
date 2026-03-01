# หลักการทำงาน
1. เราต้องสร้าง checkpointer ที่ผูกกับ DB จริง เพราะถ้าผูกกับ memory มันจะหายไปหาก server restart [checkpointer](./checkpointer.ts)
2. ให้เราสร้าง graph builder เอาไว้ สำหรับการ register ควบคุม pipeline รวมถึงการ interrupt [builder](./graph_builder.ts) 
3. สร้าง executor สำหรับการ invoke หรือ สั่งให้ pipeline ทำงาน ตามที่ config ไว้ในข้อ 2 [executor](./graph_executor.ts)
4. สร้าง resume สำหรับการ resume process ที่ interrupt [resume](./graph_resume.ts)
    - ในตัวอย่างนี้ เป็นเพียงการ mockup และทำให้จบใน 1 file
    - สำหรับการใช้งานจริง สามารถดึง thread_id ทั้งหมดได้จาก DB ที่เป็น checkpointer
    - จากนั้น เราจะใช้ `graph.getState` เพื่อดึงรายละเอียด `task` รวมถึงรายการ `__interrupt__` ออกมา เพื่อประกอบรายละเอียดส่งคืนไปยัง `UI`
    - สิ่งที่ UI ต้องส่งมา คือ 
        - data (เป็น object ที่จะ return ให้กับจุดที่ทำการ interrupt)
        - thead_id
        - interrupt_id
    - หากต้องการ `resume` ก็ใช้คำสั่ง `graph.invoke` และทำการ create object ลักษณะนี้
    ```json
    {
        "interrupt-id":{
            "isApproved":true,
            "comment":"xxx"
        }
    }
    ```