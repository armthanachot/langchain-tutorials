import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Pool } from "pg";  //bun add @types/pg


const pool = new Pool({
    connectionString: process.env.DB_URL,
});

const checkpointer = new PostgresSaver(pool);
await checkpointer.setup();

export default checkpointer;