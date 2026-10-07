# Each segment: id, kind ('story' or shot), lines: list of (caption, spoken or None)
SEG = [
 ('chain','story',[
   ("Behind almost every product made in India\nis a chain of small factories.", "Behind almost every product made in India, is a chain of small factories."),
   ("A foundry. A machine shop.\nA coating unit. An assembler.", "A foundry. A machine shop. A coating unit. An assembler."),
 ]),
 ('guess','story',[
   ("But finding the right supplier, or the right buyer,\nis still a guessing game.", "But finding the right supplier, or the right buyer, is still a guessing game."),
 ]),
 ('scramble','story',[
   ("Most can't afford paid directories.", None),
   ("So they rely on WhatsApp, phone calls,\nGoogle and references.", "So they rely on WhatsApp, phone calls, Google, and references."),
   ("And long site visits,\njust to trust one new supplier.", "And long site visits, just to trust one new supplier."),
 ]),
 ('inside','story',[
   ("Inside the factory, orders sit in WhatsApp.", "Inside the factory, orders sit in WhatsApp."),
   ("Stock in Excel. Accounts in Tally.\nQuality on paper.", "Stock in Excel. Accounts in Tally. Quality, on paper."),
   ("The same details are typed again, and again.", None),
 ]),
 ('cost','story',[
   ("Lines stop. Rejects surface late.\nGood suppliers stay invisible.", "Lines stop. Rejects surface late. Good suppliers stay invisible."),
   ("Everything is scattered.", None),
   ("And nobody can see who actually delivers.", None),
 ]),
 ('reveal','story',[
   ("XELOR changes that.", "Zeelor changes that."),
   ("The trusted network\nbehind what India manufactures.", "The trusted network, behind what India manufactures."),
 ]),
 ('network','story',[
   ("Every delivery is counted at the factory gate.", None),
   ("So every supplier earns a real record:\non time, quality, deliveries.", "So every supplier earns a real record. On time. Quality. Deliveries."),
   ("Factories find, compare and choose\neach other on that record.", "Factories find, compare, and choose each other, on that record."),
   ("Every request invites a new supplier.\nIt joins free, and brings its own buyers.", "Every request invites a new supplier. It joins free, and brings its own buyers."),
   ("The network grows with every order.", None),
 ]),
 ('three','story',[
   ("One trusted record. Three products.", None),
   ("XELOR Market. Xelogram.\nAnd an agentic AI ERP.", "Zeelor Market. Zeelogram. And an agentic A.I. E.R.P."),
 ]),
 ('mkt','shot',[
   ("XELOR Market is where small manufacturers\nfind each other.", "Zeelor Market is where small manufacturers find each other."),
   ("And see what every seller\nhas actually delivered.", "And see what every seller has actually delivered."),
 ]),
 ('price','story',[
   ("Listing starts free,\nat a fraction of a paid directory.", "Listing starts free, at a fraction of a paid directory."),
   ("XELOR only connects.\nIt never touches the money.", "Zeelor only connects. It never touches the money."),
 ]),
 ('req','shot',[
   ("A buyer's request goes to\nfive matched sellers at most.", "A buyer's request goes to five matched sellers, at most."),
   ("Never resold. No fee per lead.", "Never resold. No fee, per lead."),
 ]),
 ('help','shot',[
   ("Machine down? Find help reaches the nearest\nchecked technicians in one tap.", "Machine down? Find help reaches the nearest checked technicians, in one tap."),
   ("Repairs, testing, compliance and finance,\nall in one place.", "Repairs, testing, compliance, and finance. All in one place."),
 ]),
 ('gram','shot',[
   ("Xelogram turns a verified delivery into a post.", "Zeelogram turns a verified delivery into a post."),
   ("The agent writes the caption, in Tamil,\nKannada, Hindi or English.", "The agent writes the caption. In Tamil, Kannada, Hindi, or English."),
   ("One tap to approve and share.", None),
 ]),
 ('gramfeed','shot',[
   ("Buyers see real, verified work,\nand ask for a quote straight from the post.", "Buyers see real, verified work, and ask for a quote, straight from the post."),
 ]),
 ('profile','shot',[
   ("Every factory gets its own page,\nand chooses what stays private.", "Every factory gets its own page, and chooses what stays private."),
 ]),
 ('erp','story',[
   ("Underneath it all is an agentic AI ERP.", "Underneath it all, is an agentic A.I. E.R.P."),
   ("It links orders, suppliers, stock,\nfactory work and payments.", "It links orders, suppliers, stock, factory work, and payments."),
   ("Already using Tally? It works alongside.\nNo need to switch.", "Already using Tally? It works alongside. No need to switch."),
 ]),
 ('agent','shot',[
   ("The agent drafts the request for quotes,\nchases replies and ranks the offers.", "The agent drafts the request for quotes, chases replies, and ranks the offers."),
   ("People make the decisions.", None),
 ]),
 # one complete order (core shots, original durations)
 ('j1','shot',[("Let's follow one order, for eighty pumps.", None)]),
 ('j2','shot',[("Check the stock.\nSixty metal bodies are missing.", "Check the stock. Sixty metal bodies are missing.")]),
 ('j3','shot',[("Send one request to three suppliers.", None)]),
 ('j4','shot',[("The supplier opens a link. No login, no app.", None),("Adds a price and date, and sends the quote.", "Adds a price and date, and sends the quote.")]),
 ('j5','shot',[("Compare price, delivery,\nand each supplier's record.", "Compare price, delivery, and each supplier's record.")]),
 ('j6','shot',[("The owner checks the amount,\nand approves from the phone.", "The owner checks the amount, and approves from the phone.")]),
 ('j7','shot',[("On delivery day,\nscan the parts at the gate.", "On delivery day, scan the parts at the gate.")]),
 ('j8','shot',[("Check the parts.\nThe supplier's record updates by itself.", "Check the parts. The supplier's record updates, by itself.")]),
 ('j9','shot',[("Send the job and its parts\nto the factory team.", "Send the job, and its parts, to the factory team.")]),
 ('j10','shot',[("The team records eighty finished pumps.", None),("Each one passes four checks.", None)]),
 ('j11','shot',[("Ship the pumps.\nThe bill comes from the same order.", "Ship the pumps. The bill comes from the same order.")]),
 ('j12','shot',[("Close the order.", None)]),
 ('j13','shot',[("And the factory's own record grows.", None)]),
 ('close','story',[
   ("Every delivery builds trust.", None),
   ("XELOR. The trusted network\nbehind what India manufactures.", "Zeelor. The trusted network, behind what India manufactures."),
 ]),
]
