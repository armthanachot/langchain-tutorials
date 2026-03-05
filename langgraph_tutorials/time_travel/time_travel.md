# Time Travel [link](https://docs.langchain.com/oss/javascript/langgraph/use-time-travel)

คือการ ย้อนกลับไปดู เหตุผล (Reasoning), แก้ไขข้อผิดพลาด (Debug), หรือ ลองทางเลือกใหม่ (Explore alternatives)

- ใช้ `getStateHistory` เพื่อหา checkpoint_id ที่ต้องการ
- ใช้ `updateState` หากต้องการแก้ไขข้อมูลใน State นั้นๆ (จะเกิด Fork ใหม่)
- ใช้ `invoke(null, config)` เพื่อสั่งให้ Graph เริ่มทำงานต่อจาก Checkpoint นั้น

ถ้าเราพิจารณาจากในตัวอย่าง [index](./index.ts)
1. เราทำการ setup graph ตามปกติ
2. setup checkpointer
3. เริ่มต้นจากการ invoke ไป
4. บรรทัดที่ `63` เรามีการ getStateHistory มา เพื่อหา state การทำงาน โดยมันบอกการทำงานตั้งแต่แรกจนจบ
5. บรรทัดที่ `73` เราทดลองการ select state มา
6. บรรทัด `74` ใช้ `.next` เพื่อหาว่า state ถัดไป มันทำอะไร อ้างอิงจาก hisory
7. บรรทัด `75` ใช้ `.values` เพื่อหาว่า state ที่เลือกนั้น มีค่าเป็นอะไร
8. บรรทัด `79` เราทำการ `update state` โดยการนำ config จาก state ที่เราทำการ select ไว้มาใส่ และ โยน parameter ของ state นั้นเข้าไป (state นั้นมันเรียก node `generateTopic`) เราจึงต้องโยน parameter ให้ตรงกับ state นั้น
9. จากนั้น เราทดลอง invoke เฉพาะ state นั้น โดยการส่ง `graph.invoke(null, newConfig)` เข้าไป มันจะไปทำ `node generateTopic` ให้ 
