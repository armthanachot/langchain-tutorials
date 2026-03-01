import {
    Command,
    MemorySaver,
    START,
    END,
    StateGraph,
    StateSchema,
    interrupt,
} from "@langchain/langgraph";
import * as z from "zod";


const State = new StateSchema({
    sql: z.string(),
    isApproved: z.boolean(),
    isExecuted: z.boolean(),
    needApproval: z.boolean(),
    process: z.enum(["initial", "sql validation"]),
    errMessage: z.string().optional(),
})

const graphBuilder = new StateGraph(State).addNode("approval", async (state) => {
    console.log("state is", state);

    const { needApproval, process, sql } = state;
    let decision = { isApproved: true };

    if (needApproval) {
        if (process === "sql validation") {
            decision = await interrupt(`Are you sure you want to execute this SQL? ${sql}`);
        }
    }

    if (decision.isApproved) {
        return new Command({ goto: "execute" });
    } else {
        return new Command({ goto: END, update: { errMessage: "User rejected the request" } });
    }
}, { ends: ["execute", END] }
).addNode("validation", async (state) => {
    const { sql } = state;
    console.log(`Executing SQL: ${sql}`);
    if (sql.toLowerCase().includes("delete")) {
        return new Command({ goto: "approval", update: { process: "sql validation", needApproval: true } }); // update เป็นการ update state แปลว่า node ถัดไปจะได้รับ state ที่ถูก update ไป
    } else {
        return new Command({ goto: "execute" });
    }
}, { ends: ["approval", "execute"] }).addNode("execute", async (state) => {
    const { sql } = state;
    return {
        executed: true,
        sql: sql,
        message: "SQL executed successfully",
    };
})
    .addEdge(START, "validation")
    // .addEdge("validation", "execute") //ไม่จำเป็น เพราะใน validation node เรา มีการใช้งาน goto เอง จึงไม่จำเป็นต้องใส่ edge นี้
    .addEdge("execute", END); // ถ้าเรา handle END ใน execute node เอง ก็ไม่จำเป็นต้องใส่ edge นี้


const checkpointer = new MemorySaver();
const graph = graphBuilder.compile({ checkpointer });

const config = { configurable: { thread_id: "approval-123" } };

// const initial = await graph.invoke({ sql: "SELECT * FROM users" }, config);
const initial = await graph.invoke({ sql: "DELETE FROM users", process: "initial" }, config);
let out = initial;

if ("__interrupt__" in out) {
    console.log("interrupt is", initial);

    out = await graph.invoke(new Command({ resume: { isApproved: false } }), config);
}

console.log(out);
