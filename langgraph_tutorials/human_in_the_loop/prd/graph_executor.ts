import graph from "./graph_builder";
import config from "./config";


const initial = await graph.invoke({ sqlQuery: "DELETE FROM users" }, config);

if("__interrupt__" in initial) {
    console.log(initial);
    console.log("pending approval");
}

console.log("end of program");