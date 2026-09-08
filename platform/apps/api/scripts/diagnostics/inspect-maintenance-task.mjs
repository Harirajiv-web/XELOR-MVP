import { token, makeClient } from "../shared/demo-client.mjs";
const call = makeClient(await token("venkat"));
const wo = await call("GET","/api/v1/maintenance/work-orders/MWO-2627-00001");
const tasks = wo.body?.tasks ?? [];
console.log("TASKS:", JSON.stringify(tasks.map(t=>({seq:t.sequence??t.seq, rt:t.resultType, rv:t.resultValue, pass:t.isPass, mand:t.isMandatory}))));
const p = await call("PATCH","/api/v1/maintenance/work-orders/MWO-2627-00001/tasks/1",{value:"ok"});
console.log("PATCH1:", p.status, JSON.stringify(p.body).slice(0,300));
