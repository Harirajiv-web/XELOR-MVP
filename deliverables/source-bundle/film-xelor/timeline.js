window.XELOR_TIMELINE={
"duration": 229.685,
"chapters": [
{
"t": 0.0,
"end": 9.487,
"title": "The problem",
"label": "Made in India",
"story": "chain"
},
{
"t": 9.487,
"end": 15.069,
"title": "",
"label": "",
"story": "guess"
},
{
"t": 15.069,
"end": 25.794,
"title": "",
"label": "",
"story": "scramble"
},
{
"t": 25.794,
"end": 36.085,
"title": "",
"label": "",
"story": "inside"
},
{
"t": 36.085,
"end": 47.114,
"title": "",
"label": "",
"story": "cost"
},
{
"t": 47.114,
"end": 54.737,
"title": "",
"label": "",
"story": "reveal"
},
{
"t": 54.737,
"end": 75.836,
"title": "",
"label": "",
"story": "network"
},
{
"t": 75.836,
"end": 84.051,
"title": "",
"label": "",
"story": "three"
},
{
"title": "Find the right factory. See what it has delivered.",
"label": "XELOR Market · the flagship",
"t": 84.051,
"end": 91.562
},
{
"t": 91.562,
"end": 99.549,
"title": "Pricing",
"label": "XELOR Market",
"story": "price"
},
{
"title": "Five matched sellers. Never resold.",
"label": "XELOR Market · buyer requests",
"t": 99.549,
"end": 106.874
},
{
"title": "Machine down? Help in one tap.",
"label": "XELOR Market · find help",
"t": 106.874,
"end": 116.959
},
{
"title": "A verified delivery becomes a post.",
"label": "Xelogram · on the supplier’s phone",
"t": 116.959,
"end": 129.004
},
{
"title": "Real work brings the next order.",
"label": "Xelogram · the feed",
"t": 129.004,
"end": 134.813
},
{
"t": 134.813,
"end": 147.744,
"title": "One place to run the factory.",
"label": "The engine · agentic AI ERP",
"story": "erp",
"diagram": true
},
{
"title": "The agent prepares. People decide.",
"label": "The engine · agentic AI ERP",
"t": 147.744,
"end": 155.688
},
{
"title": "1. Confirm the customer’s order.",
"label": "One complete order · Step 1 of 12",
"core": true,
"t": 155.688,
"end": 159.688
},
{
"title": "2. Check which parts are missing.",
"label": "One complete order · Step 2 of 12",
"core": true,
"t": 159.688,
"end": 164.688
},
{
"title": "3. Ask suppliers for a price.",
"label": "One complete order · Step 3 of 12",
"core": true,
"t": 164.688,
"end": 168.688
},
{
"title": "4. The supplier sends a quote.",
"label": "One complete order · Step 4 of 12",
"core": true,
"t": 168.688,
"end": 175.688
},
{
"title": "5. Choose the right supplier.",
"label": "One complete order · Step 5 of 12",
"core": true,
"t": 175.688,
"end": 180.688
},
{
"title": "6. The owner approves the purchase.",
"label": "One complete order · Step 6 of 12",
"core": true,
"t": 180.688,
"end": 185.688
},
{
"title": "7. Record the arriving parts.",
"label": "One complete order · Step 7 of 12",
"core": true,
"t": 185.688,
"end": 191.688
},
{
"title": "8. Check the parts before using them.",
"label": "One complete order · Step 8 of 12",
"core": true,
"t": 191.688,
"end": 196.688
},
{
"title": "9. Send the job to the factory team.",
"label": "One complete order · Step 9 of 12",
"core": true,
"t": 196.688,
"end": 201.688
},
{
"title": "10. Build the pumps. Check the work.",
"label": "One complete order · Step 10 of 12",
"core": true,
"t": 201.688,
"end": 209.688
},
{
"title": "11. Send the pumps and create the bill.",
"label": "One complete order · Step 11 of 12",
"core": true,
"t": 209.688,
"end": 213.688
},
{
"title": "12. Close the order. Keep the record.",
"label": "One complete order · Step 12 of 12",
"core": true,
"t": 213.688,
"end": 216.288
},
{
"title": "The factory’s record grows.",
"label": "One complete order · Done",
"core": true,
"t": 216.288,
"end": 220.488
},
{
"t": 220.488,
"end": 229.685,
"title": "XELOR",
"label": "XELOR",
"story": "close"
}
],
"shots": [
{
"screen": "k.home",
"step": 20,
"role": "XELOR MARKET",
"highlight": ".mcard",
"holdLabel": "Earned records on every card",
"note": "XELOR Market · free to list · buyers and sellers deal directly",
"t": 84.051,
"end": 91.562,
"actions": [
{
"at": 2.6,
"target": "marketMachining",
"type": "click",
"value": null,
"after": {
"target": ".mcard",
"label": "Machining shops nearby"
}
}
],
"index": 0,
"holdStart": 0.8
},
{
"screen": "k.req",
"step": 17,
"role": "XELOR MARKET",
"highlight": ".reqbox",
"holdLabel": "A real buyer request",
"note": "Each request reaches five matched sellers at most · no fee per lead",
"t": 99.549,
"end": 106.874,
"actions": [
{
"at": 4.943,
"target": "buyerInterest",
"type": "click",
"value": null,
"after": {
"target": ".card",
"label": "Interest sent with the record"
}
}
],
"index": 1,
"holdStart": 0.8
},
{
"screen": "k.help",
"step": 16,
"role": "XELOR MARKET",
"holdLabel": "Checked providers nearby",
"note": "Repairs · testing · compliance · finance · support schemes",
"t": 106.874,
"end": 116.959,
"actions": [
{
"at": 1.75,
"target": "machineHelp",
"type": "click",
"value": null,
"after": {
"target": ".urgent",
"label": "Nearest technicians found"
}
},
{
"at": 6.115,
"target": "callTechnician",
"type": "click",
"value": null,
"after": {
"target": ".pro.first",
"label": "Technician called"
}
}
],
"index": 2,
"holdStart": 0.8
},
{
"screen": "s.gram",
"step": 18,
"role": "SRI GANESH · SUPPLIER",
"phone": true,
"holdLabel": "Drafted by the agent",
"note": "Xelogram · captions in Tamil, Kannada, Hindi or English · buyer names stay hidden",
"t": 116.959,
"end": 129.004,
"actions": [
{
"at": 7.507,
"target": "postEnglish",
"type": "click",
"value": null,
"after": null
},
{
"at": 9.095,
"target": "approvePost",
"type": "click",
"value": null,
"after": {
"target": ".card.ok",
"label": "Posted on Xelogram"
}
},
{
"at": 10.545,
"target": "sharePost",
"type": "click",
"value": null,
"after": {
"target": ".shares",
"label": "Shared to WhatsApp Status"
}
}
],
"index": 3,
"holdStart": 0.8
},
{
"screen": "k.gram",
"step": 19,
"role": "BUYERS · XELOGRAM",
"highlight": ".gpost",
"holdLabel": "Verified delivery badge",
"note": "Every post carries a verified-delivery badge and a Request quote button",
"t": 129.004,
"end": 134.813,
"actions": [
{
"at": 3.8,
"target": "postQuote",
"type": "click",
"value": null,
"after": {
"target": ".gpost",
"label": "Quote requested"
}
}
],
"index": 4,
"holdStart": 0.8
},
{
"screen": "p.agent",
"step": 5,
"role": "BUYING TEAM",
"highlight": ".card h4",
"holdLabel": "People decide",
"note": "Works alongside Tally · every action needs a person to approve",
"t": 147.744,
"end": 155.688,
"actions": [],
"index": 5,
"holdStart": 0.8
},
{
"screen": "p.sales",
"step": 0,
"core": true,
"flow": 0,
"holdLabel": "80 pumps",
"role": "PRIYA · BUYING TEAM",
"highlight": ".tbl tbody tr:first-child td:nth-child(2)",
"t": 155.688,
"end": 159.688,
"actions": [
{
"at": 2.7,
"target": "confirmOrder",
"type": "click",
"value": null,
"after": {
"target": ".stamp",
"label": "Order confirmed"
}
}
],
"index": 6,
"holdStart": 0.8
},
{
"screen": "p.plan",
"step": 1,
"core": true,
"flow": 0,
"holdLabel": "Check the stock",
"role": "PRIYA · BUYING TEAM",
"t": 159.688,
"end": 164.688,
"actions": [
{
"at": 1.25,
"target": "checkMaterials",
"type": "click",
"value": null,
"after": {
"target": ".hot td:nth-child(5)",
"label": "60 more needed"
}
}
],
"index": 7,
"holdStart": 0.8
},
{
"screen": "p.net",
"step": 2,
"core": true,
"flow": 1,
"holdLabel": "Ask the suppliers",
"role": "PRIYA · BUYING TEAM",
"t": 164.688,
"end": 168.688,
"actions": [
{
"at": 2.4,
"target": "sendRequest",
"type": "click",
"value": null,
"after": {
"target": ".kpis .kpi:first-child",
"label": "Request sent"
}
}
],
"index": 8,
"holdStart": 0.8
},
{
"screen": "s.quote",
"step": 3,
"core": true,
"flow": 1,
"holdLabel": "A simple price reply",
"role": "GANESH · SUPPLIER",
"phone": true,
"t": 168.688,
"end": 175.688,
"actions": [
{
"at": 1.85,
"target": "quotePrice",
"type": "type",
"value": "2760",
"after": null
},
{
"at": 3.2,
"target": "quoteDate",
"type": "input",
"value": "2026-10-09",
"after": null
},
{
"at": 4.5,
"target": "quoteFreight",
"type": "type",
"value": "2400",
"after": null
},
{
"at": 5.9,
"target": "sendQuote",
"type": "click",
"value": null,
"after": {
"target": ".bub:last-child",
"label": "Quote sent"
}
}
],
"index": 9,
"holdStart": 0.8
},
{
"screen": "p.net",
"step": 4,
"core": true,
"flow": 1,
"holdLabel": "Price + date + past work",
"role": "PRIYA · BUYING TEAM",
"highlight": "[data-flip=\"ganesh\"] .proof",
"t": 175.688,
"end": 180.688,
"actions": [
{
"at": 3.4,
"target": "award",
"type": "click",
"value": null,
"after": {
"target": ".docsheet .dh",
"label": "Purchase order created"
}
}
],
"index": 10,
"holdStart": 0.8
},
{
"screen": "w.po",
"step": 5,
"core": true,
"flow": 1,
"holdLabel": "Check the amount",
"role": "FACTORY OWNER",
"highlight": ".card .amt",
"phone": true,
"t": 180.688,
"end": 185.688,
"actions": [
{
"at": 3.35,
"target": "approve",
"type": "click",
"value": null,
"after": {
"target": ".card",
"label": "Approved"
}
}
],
"index": 11,
"holdStart": 0.8
},
{
"screen": "t.gate",
"step": 6,
"core": true,
"flow": 2,
"holdLabel": "The parts arrive",
"role": "STORES",
"timeJump": "Delivery day",
"t": 185.688,
"end": 191.688,
"actions": [
{
"at": 1.5,
"target": "truck",
"type": "click",
"value": null,
"after": null
},
{
"at": 3.8,
"target": "scan",
"type": "click",
"value": null,
"after": {
"target": ".card.ok",
"label": "Delivery recorded"
}
}
],
"index": 12,
"holdStart": 0.8
},
{
"screen": "t.qc",
"step": 7,
"core": true,
"flow": 2,
"holdLabel": "Check before use",
"role": "QUALITY TEAM",
"t": 191.688,
"end": 196.688,
"actions": [
{
"at": 2.9,
"target": "passInspection",
"type": "click",
"value": null,
"after": {
"target": ".card.ok",
"label": "Parts passed · record updated"
}
}
],
"index": 13,
"holdStart": 0.8
},
{
"screen": "m.wo",
"step": 8,
"core": true,
"flow": 3,
"holdLabel": "Parts ready for the job",
"role": "FACTORY TEAM",
"t": 196.688,
"end": 201.688,
"actions": [
{
"at": 3.0,
"target": "release",
"type": "click",
"value": null,
"after": {
"target": ".card",
"label": "Job released"
}
}
],
"index": 14,
"holdStart": 0.8
},
{
"screen": "m.wo",
"step": 9,
"core": true,
"flow": 3,
"holdLabel": "80 pumps made",
"role": "FACTORY TEAM",
"timeJump": "After production",
"t": 201.688,
"end": 209.688,
"actions": [
{
"at": 1.3,
"target": "recordOutput",
"type": "click",
"value": null,
"after": {
"target": ".hero",
"label": "80 pumps recorded"
}
},
{
"at": 2.8,
"target": "test0",
"type": "click",
"value": null,
"after": null
},
{
"at": 3.6,
"target": "test1",
"type": "click",
"value": null,
"after": null
},
{
"at": 4.4,
"target": "test2",
"type": "click",
"value": null,
"after": null
},
{
"at": 5.2,
"target": "test3",
"type": "click",
"value": null,
"after": null
},
{
"at": 6.6,
"target": "finalTest",
"type": "click",
"value": null,
"after": {
"target": ".center",
"label": "All checks passed"
}
}
],
"index": 15,
"holdStart": 0.8
},
{
"screen": "a.dispatch",
"step": 10,
"core": true,
"flow": 4,
"holdLabel": "Send the pumps",
"role": "DISPATCH · ACCOUNTS",
"t": 209.688,
"end": 213.688,
"actions": [
{
"at": 1.4,
"target": "dispatch",
"type": "click",
"value": null,
"after": null
},
{
"at": 2.6,
"target": "irn",
"type": "click",
"value": null,
"after": {
"target": ".docsheet .dh",
"label": "Bill created"
}
}
],
"index": 16,
"holdStart": 0.8
},
{
"screen": "a.books",
"step": 12,
"core": true,
"flow": 4,
"holdLabel": "Finish the order",
"role": "ACCOUNTS",
"t": 213.688,
"end": 216.288,
"actions": [
{
"at": 1.15,
"target": "closeOrder",
"type": "click",
"value": null,
"after": {
"target": ".stamp",
"label": "Order closed"
}
}
],
"index": 17,
"holdStart": 0.8
},
{
"screen": "p.pass",
"step": 13,
"core": true,
"flow": 5,
"holdLabel": "Work history updated",
"role": "FACTORY OWNER",
"highlight": ".card",
"call": "The factory’s record updates.",
"t": 216.288,
"end": 220.488,
"actions": [],
"index": 18,
"holdStart": 0.8
}
],
"story": {
"chain": {
"t": 0.0,
"end": 9.487,
"cues": [
0.9,
5.787
],
"ends": [
5.337,
9.136
]
},
"guess": {
"t": 9.487,
"end": 15.069,
"cues": [
9.737
],
"ends": [
13.769
]
},
"scramble": {
"t": 15.069,
"end": 25.794,
"cues": [
15.419,
17.76,
21.773
],
"ends": [
17.36,
21.323,
24.994
]
},
"inside": {
"t": 25.794,
"end": 36.085,
"cues": [
26.144,
28.919,
32.811
],
"ends": [
28.619,
32.311,
35.286
]
},
"cost": {
"t": 36.085,
"end": 47.114,
"cues": [
36.385,
41.445,
43.282
],
"ends": [
40.545,
42.682,
45.714
]
},
"reveal": {
"t": 47.114,
"end": 54.737,
"cues": [
48.614,
50.415
],
"ends": [
49.915,
53.636
]
},
"network": {
"t": 54.737,
"end": 75.836,
"cues": [
55.237,
58.126,
63.234,
67.446,
72.738
],
"ends": [
57.776,
62.734,
66.946,
72.438,
74.637
]
},
"three": {
"t": 75.836,
"end": 84.051,
"cues": [
76.236,
78.797
],
"ends": [
78.497,
82.85
]
},
"price": {
"t": 91.562,
"end": 99.549,
"cues": [
91.962,
95.711
],
"ends": [
95.311,
98.548
]
},
"erp": {
"t": 134.813,
"end": 147.744,
"cues": [
135.263,
139.055,
143.11
],
"ends": [
138.655,
142.66,
146.843
]
},
"close": {
"t": 220.488,
"end": 229.685,
"cues": [
221.088,
223.267
],
"ends": [
222.667,
227.086
]
}
}
};
