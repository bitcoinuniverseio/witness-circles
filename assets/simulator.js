/* Circle state simulator.
   Everything runs in this tab. Nothing typed here is transmitted, stored or logged.
   All protocol behaviour comes from assets/witc.js, which re-implements the rules in
   src/marker.ts, src/transaction.ts, src/planner.ts, src/validator.ts and src/state.ts. */
(function () {
  "use strict";

  var W = window.WITC;
  if (!W) return;

  var NS = "http://www.w3.org/2000/svg";
  var DEFAULT_CONTEXT_HASH = "ad2608134839e732280cb93bdd5b8682626dce5748a65c437a39cdcb680c2a82";
  var DEFAULT_KEYS = [
    "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    "c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5",
    "f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9",
    "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13",
    "2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4",
    "fff97bd5755eeea420453a14355235d382f6472f8568a18b2f057a1460297556",
    "5cbdf0646e5db4eaa398f365f2ea7a0e3d419b7e0330e39ce92bddedcac4f9bc",
    "2f01e5e15cca351daff3843fb70f3c2f0a1bdd05e5af888a67784ef3e10a2a01"
  ];

  /* The first three rows reproduce the published golden Signet vector exactly. */
  var SEED_MEMBERS = [
    { outpoint: "11".repeat(32) + ":0", value: 30000, key: DEFAULT_KEYS[0] },
    { outpoint: "22".repeat(32) + ":1", value: 40000, key: DEFAULT_KEYS[1] },
    { outpoint: "33".repeat(32) + ":2", value: 50000, key: DEFAULT_KEYS[2] }
  ];

  function byteHex(value) {
    return ("0" + (value & 0xff).toString(16)).slice(-2);
  }

  function text(value) {
    return document.createTextNode(value);
  }

  function el(tag, attributes, children) {
    var node = document.createElement(tag);
    if (attributes) {
      Object.keys(attributes).forEach(function (key) {
        if (key === "class") node.className = attributes[key];
        else node.setAttribute(key, attributes[key]);
      });
    }
    (children || []).forEach(function (child) {
      node.appendChild(typeof child === "string" ? text(child) : child);
    });
    return node;
  }

  function svgEl(tag, attributes) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attributes || {}).forEach(function (key) {
      node.setAttribute(key, attributes[key]);
    });
    return node;
  }

  function formatSats(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function shorten(value, head, tail) {
    if (value.length <= head + tail + 1) return value;
    return value.slice(0, head) + "…" + value.slice(value.length - tail);
  }

  /* ================= circle builder ================= */

  var builder = document.querySelector("[data-builder]");
  if (builder) initBuilder(builder);

  function initBuilder(rootNode) {
    var listNode = rootNode.querySelector("[data-members]");
    var addButton = rootNode.querySelector("[data-add-member]");
    var verdictNode = rootNode.querySelector("[data-verdict]");
    var stepsNode = rootNode.querySelector("[data-steps]");
    var factsNode = rootNode.querySelector("[data-facts]");
    var ringNode = rootNode.querySelector("[data-ring]");
    var ringText = rootNode.querySelector("[data-ring-text]");
    var allocationNode = rootNode.querySelector("[data-allocation]");
    var markerNode = rootNode.querySelector("[data-marker-out]");
    var networkInput = rootNode.querySelector("[data-network]");
    var contextInput = rootNode.querySelector("[data-context-hash]");
    var feeRateInput = rootNode.querySelector("[data-fee-rate]");
    var heightInput = rootNode.querySelector("[data-circle-height]");
    var prevHeightInput = rootNode.querySelector("[data-input-height]");

    var members = [];
    var counter = 0;
    var runToken = 0;

    function defaultMember(index) {
      var seed = SEED_MEMBERS[index];
      return {
        id: "m" + counter++,
        outpoint: seed ? seed.outpoint : byteHex(index + 4).repeat(32) + ":" + index,
        value: seed ? seed.value : 25000,
        key: DEFAULT_KEYS[index] || byteHex(index + 0x80).repeat(32),
        witnessed: true
      };
    }

    /* Restores every control, so each preset starts from the same known state. */
    function reset(count) {
      members = [];
      for (var i = 0; i < count; i += 1) members.push(defaultMember(i));
      networkInput.value = "signet";
      feeRateInput.value = "10";
      heightInput.value = "200";
      prevHeightInput.value = "199";
      contextInput.value = DEFAULT_CONTEXT_HASH;
      renderMembers();
    }

    function renderMembers() {
      listNode.textContent = "";
      members.forEach(function (member, index) {
        var row = el("li", { class: "member" });
        row.appendChild(el("span", { class: "slot" }, [String(index)]));

        var outpointField = el("label", { class: "field" });
        outpointField.appendChild(el("span", {}, ["Input outpoint (txid:vout)"]));
        var outpointInput = el("input", { type: "text", value: member.outpoint, spellcheck: "false" });
        outpointInput.addEventListener("input", function () {
          member.outpoint = outpointInput.value;
          run();
        });
        outpointField.appendChild(outpointInput);
        row.appendChild(outpointField);

        var keyField = el("label", { class: "field" });
        keyField.appendChild(el("span", {}, ["Taproot output key (32-byte hex)"]));
        var keyInput = el("input", { type: "text", value: member.key, spellcheck: "false" });
        keyInput.addEventListener("input", function () {
          member.key = keyInput.value;
          run();
        });
        keyField.appendChild(keyInput);
        row.appendChild(keyField);

        var side = el("div", {});

        var valueField = el("label", { class: "field" });
        valueField.appendChild(el("span", {}, ["Input value (sats)"]));
        var valueInput = el("input", { type: "number", min: "0", step: "1", value: String(member.value) });
        valueInput.addEventListener("input", function () {
          member.value = valueInput.value === "" ? 0 : Number(valueInput.value);
          run();
        });
        valueField.appendChild(valueInput);
        side.appendChild(valueField);

        var witnessLabel = el("label", { class: "field" });
        var witnessBox = el("input", { type: "checkbox" });
        witnessBox.checked = member.witnessed;
        witnessBox.addEventListener("change", function () {
          member.witnessed = witnessBox.checked;
          run();
        });
        var witnessLine = el("span", { class: "inline-check" }, []);
        witnessLine.appendChild(witnessBox);
        witnessLine.appendChild(text(" signature contributed"));
        witnessLabel.appendChild(witnessLine);
        side.appendChild(witnessLabel);

        var drop = el("button", { type: "button", class: "drop" }, ["Remove slot " + index]);
        drop.addEventListener("click", function () {
          members = members.filter(function (candidate) {
            return candidate.id !== member.id;
          });
          renderMembers();
          run();
        });
        side.appendChild(drop);
        row.appendChild(side);
        listNode.appendChild(row);
      });
      if (addButton) addButton.disabled = members.length >= W.MAX_PARTICIPANTS;
    }

    if (addButton) {
      addButton.addEventListener("click", function () {
        if (members.length >= W.MAX_PARTICIPANTS) return;
        members.push(defaultMember(members.length));
        renderMembers();
        run();
      });
    }

    rootNode.querySelectorAll("[data-preset]").forEach(function (button) {
      button.addEventListener("click", function () {
        applyPreset(button.getAttribute("data-preset"));
      });
    });

    function applyPreset(name) {
      if (name === "valid") {
        reset(3);
        run();
        return;
      }
      if (name === "duplicate-key") {
        reset(3);
        members[1].key = members[0].key;
      } else if (name === "duplicate-input") {
        reset(3);
        members[1].outpoint = members[0].outpoint;
      } else if (name === "dust") {
        reset(3);
        members[2].value = 1200;
        feeRateInput.value = "5";
      } else if (name === "single") {
        reset(1);
      } else if (name === "unconfirmed") {
        reset(3);
        prevHeightInput.value = heightInput.value;
      } else if (name === "open") {
        reset(3);
        members[2].witnessed = false;
      }
      renderMembers();
      run();
    }

    [networkInput, contextInput, feeRateInput, heightInput, prevHeightInput].forEach(function (node) {
      if (node) node.addEventListener("input", run);
      if (node) node.addEventListener("change", run);
    });

    function parseOutpoint(value) {
      var raw = String(value).trim();
      var separator = raw.lastIndexOf(":");
      if (separator === -1) throw W.error("INVALID_OUTPOINT", "Outpoint must be written as txid:vout");
      var vout = Number(raw.slice(separator + 1));
      if (!Number.isInteger(vout) || vout < 0 || vout > 0xffffffff) {
        throw W.error("INVALID_OUTPOINT", "Outpoint vout must be a 32-bit unsigned integer");
      }
      return { txid: W.bytesToHex(W.hexToBytes(raw.slice(0, separator), 32)), vout: vout };
    }

    function build() {
      var network = networkInput.value;
      var feeRate = BigInt(Math.max(1, Math.floor(Number(feeRateInput.value) || 1)));
      var circleHeight = Math.max(1, Math.floor(Number(heightInput.value) || 1));
      var inputHeight = Math.max(0, Math.floor(Number(prevHeightInput.value) || 0));
      var contextHash = String(contextInput.value).trim().toLowerCase();

      if (members.length < W.MIN_PARTICIPANTS) {
        throw W.error("INPUT_COUNT", "A Circle needs at least " + W.MIN_PARTICIPANTS + " participants");
      }

      var participants = members.map(function (member) {
        var outpoint = parseOutpoint(member.outpoint);
        return {
          txid: outpoint.txid,
          vout: outpoint.vout,
          value: BigInt(Math.max(0, Math.floor(member.value))),
          scriptPubKey: W.hexToBytes("5120" + String(member.key).trim().toLowerCase(), 34),
          blockHeight: inputHeight,
          witnessed: member.witnessed
        };
      });
      participants.sort(W.compareOutpoints);

      var vsize = W.estimateCircleVsize(participants.length);
      var totalFee = BigInt(vsize) * feeRate;
      var shares = W.allocateEqualFeeShares(totalFee, participants.length);
      var markerScript = W.encodeMarkerScript({
        network: network,
        participantCount: participants.length,
        contextHash: contextHash
      });

      var transaction = {
        version: 2,
        inputs: participants.map(function (participant) {
          return {
            txid: participant.txid,
            vout: participant.vout,
            scriptSig: new Uint8Array(),
            sequence: W.REQUIRED_SEQUENCE,
            witness: []
          };
        }),
        outputs: [{ value: 0n, scriptPubKey: markerScript }].concat(
          participants.map(function (participant, slot) {
            return { value: participant.value - shares[slot], scriptPubKey: participant.scriptPubKey };
          })
        ),
        lockTime: 0
      };

      return {
        network: network,
        participants: participants,
        vsize: vsize,
        feeRate: feeRate,
        totalFee: totalFee,
        shares: shares,
        markerScript: markerScript,
        transaction: transaction,
        circleHeight: circleHeight
      };
    }

    function run() {
      runToken += 1;
      var token = runToken;
      var plan;
      try {
        plan = build();
      } catch (error) {
        showFailure(error, null);
        return;
      }
      W.safeValidateCircle(plan.transaction, {
        network: plan.network,
        currentBlockHeight: plan.circleHeight,
        prevouts: plan.participants,
        signatureMode: "unsigned"
      })
        .then(function (result) {
          if (token !== runToken) return;
          if (result.valid === true) showResult(plan, result);
          else showFailure({ code: result.code, message: result.message }, plan);
        })
        .catch(function (error) {
          if (token !== runToken) return;
          showFailure({ code: error.code, message: error.message }, plan);
        });
    }

    function showFailure(error, plan) {
      var code = error.code || "INVALID_TRANSACTION";
      verdictNode.setAttribute("data-state", "invalid");
      verdictNode.textContent = "";
      verdictNode.appendChild(el("b", {}, ["This circle does not close"]));
      verdictNode.appendChild(
        el("p", {}, [
          "The reference validator rejects it with error code ",
          el("code", {}, [code]),
          ". "
        ])
      );
      verdictNode.appendChild(el("p", {}, [error.message || "The candidate is not a valid Circle."]));
      renderSteps(plan, { code: code, message: error.message });
      renderFacts(plan, null);
      renderAllocation(plan, null);
      renderRing(plan, false);
      if (markerNode) markerNode.textContent = plan ? W.bytesToHex(plan.markerScript) : "unavailable";
    }

    function showResult(plan, result) {
      var open = plan.participants.filter(function (participant) {
        return !participant.witnessed;
      });
      var closed = open.length === 0;
      verdictNode.setAttribute("data-state", closed ? "valid" : "invalid");
      verdictNode.textContent = "";
      if (closed) {
        verdictNode.appendChild(el("b", {}, ["The circle closes"]));
        verdictNode.appendChild(
          el("p", {}, [
            "Every structural rule passes and all " +
              plan.participants.length +
              " participants contributed a signature. Once this transaction confirms, it applies one state transition and each participant owns a successor shard."
          ])
        );
      } else {
        verdictNode.appendChild(el("b", {}, ["Structurally valid, not yet closed"]));
        verdictNode.appendChild(
          el("p", {}, [
            "Every structural rule passes, but " +
              open.length +
              " of " +
              plan.participants.length +
              " participants have not contributed a signature. A Circle is only authorized when every input carries a valid key-path signature, so this transaction cannot confirm."
          ])
        );
      }
      renderSteps(plan, null);
      renderFacts(plan, result);
      renderAllocation(plan, result);
      renderRing(plan, true);
      if (markerNode) markerNode.textContent = W.bytesToHex(plan.markerScript);
    }

    function renderSteps(plan, failure) {
      if (!stepsNode) return;
      stepsNode.textContent = "";
      var n = plan ? plan.participants.length : members.length;
      var checks = [
        {
          label: "Participant count is 2 to 16",
          ok: n >= 2 && n <= 16,
          detail: n + " participants declared in the marker and used as inputs"
        },
        {
          label: "Every input is a distinct native P2TR output key",
          ok: failure === null || (failure.code !== "DUPLICATE_SCRIPT" && failure.code !== "INVALID_P2TR"),
          detail: "Rule 6 and rule 8 of the transaction grammar"
        },
        {
          label: "Every input outpoint appears once",
          ok: failure === null || failure.code !== "DUPLICATE_INPUT",
          detail: "Rule 7 of the transaction grammar"
        },
        {
          label: "Inputs are sorted by display txid then vout",
          ok: failure === null || failure.code !== "INPUT_ORDER",
          detail: "Rule 9. The builder sorts for you, which is what a coordinator must do"
        },
        {
          label: "Every input is confirmed in an earlier block",
          ok: failure === null || failure.code !== "INPUT_UNCONFIRMED",
          detail: "Rule 5"
        },
        {
          label: "Each successor returns to its own input script",
          ok: failure === null || failure.code !== "OUTPUT_MAPPING",
          detail: "Rule 11 and the deterministic fee allocation of section 7"
        },
        {
          label: "Each successor is at least 1,000 sats",
          ok: failure === null || failure.code !== "SUCCESSOR_DUST",
          detail: "Rule 12"
        },
        {
          label: "All mutual commitments present",
          ok:
            failure === null &&
            plan !== null &&
            plan.participants.every(function (participant) {
              return participant.witnessed;
            }),
          detail: "Rule 14 to rule 17. Every input needs one key-path signature over the whole transaction"
        }
      ];
      checks.forEach(function (item) {
        var node = el("li", { "data-ok": item.ok ? "true" : "false" });
        node.appendChild(el("b", {}, [(item.ok ? "Pass. " : "Blocked. ") + item.label]));
        node.appendChild(el("span", {}, [item.detail]));
        stepsNode.appendChild(node);
      });
    }

    function renderFacts(plan, result) {
      if (!factsNode) return;
      factsNode.textContent = "";
      if (!plan) return;
      var rows = [
        ["Participants", String(plan.participants.length)],
        ["Estimated size", plan.vsize + " vB"],
        ["Fee rate", plan.feeRate.toString() + " sat/vB"],
        ["Total fee", formatSats(plan.totalFee.toString()) + " sats"],
        ["Marker script", plan.markerScript.length + " bytes"]
      ];
      if (result) {
        rows.push(["Unsigned txid", shorten(result.txid, 12, 8)]);
        rows.push(["Actual fee", formatSats(result.fee.toString()) + " sats"]);
      }
      rows.forEach(function (row) {
        var wrap = el("div", {});
        wrap.appendChild(el("dt", {}, [row[0]]));
        wrap.appendChild(el("dd", {}, [row[1]]));
        factsNode.appendChild(wrap);
      });
    }

    function renderAllocation(plan, result) {
      if (!allocationNode) return;
      allocationNode.textContent = "";
      if (!plan) return;
      var table = el("table");
      var head = el("thead");
      var headRow = el("tr");
      ["Slot", "Input", "Fee share", "Successor", "Signature"].forEach(function (label) {
        headRow.appendChild(el("th", { scope: "col" }, [label]));
      });
      head.appendChild(headRow);
      table.appendChild(head);
      var body = el("tbody");
      plan.participants.forEach(function (participant, slot) {
        var share = plan.shares[slot];
        var successor = participant.value - share;
        var row = el("tr");
        row.appendChild(el("th", { scope: "row", class: "num" }, [String(slot)]));
        row.appendChild(el("td", { class: "num" }, [formatSats(participant.value.toString())]));
        row.appendChild(el("td", { class: "num" }, [formatSats(share.toString())]));
        row.appendChild(
          el("td", { class: "num" }, [successor >= 0n ? formatSats(successor.toString()) : "negative"])
        );
        row.appendChild(
          el("td", {}, [
            el("span", { class: "pill " + (participant.witnessed ? "on" : "off") }, [
              participant.witnessed ? "witnessed" : "missing"
            ])
          ])
        );
        body.appendChild(row);
      });
      table.appendChild(body);
      allocationNode.appendChild(table);
      if (result) {
        allocationNode.appendChild(
          el("p", { class: "tool-note" }, [
            "Values above are recomputed by the same fee allocation the reference validator enforces: q = floor(F / N) with the first F mod N slots paying one extra satoshi."
          ])
        );
      }
    }

    function renderRing(plan, structurallyValid) {
      if (!ringNode) return;
      ringNode.textContent = "";
      var size = 360;
      var cx = 180;
      var cy = 180;
      var radius = 116;
      var svg = svgEl("svg", {
        viewBox: "0 0 " + size + " " + size,
        role: "img",
        "aria-labelledby": "ring-title ring-desc"
      });
      var count = plan ? plan.participants.length : 0;
      var witnessedCount = plan
        ? plan.participants.filter(function (participant) {
            return participant.witnessed;
          }).length
        : 0;
      var closed = structurallyValid && count >= 2 && witnessedCount === count;

      var title = svgEl("title", { id: "ring-title" });
      title.textContent = closed
        ? "A closed circle of " + count + " witnessed members"
        : "An open circle with " + witnessedCount + " of " + count + " members witnessed";
      svg.appendChild(title);
      var desc = svgEl("desc", { id: "ring-desc" });
      desc.textContent = closed
        ? "Every member node is joined to its neighbours by a luminous attestation arc, and the ring is unbroken."
        : "Members without a contributed signature are drawn muted and their arcs are dashed, leaving the ring open.";
      svg.appendChild(desc);

      svg.appendChild(svgEl("circle", { cx: cx, cy: cy, r: 152, class: "d-ring" }));
      svg.appendChild(svgEl("circle", { cx: cx, cy: cy, r: 58, class: "d-core" }));

      var marker = svgEl("text", { x: cx, y: cy - 4, "text-anchor": "middle", class: "d-label" });
      marker.textContent = "OP_RETURN";
      svg.appendChild(marker);
      var markerSub = svgEl("text", { x: cx, y: cy + 14, "text-anchor": "middle", class: "d-label-mono" });
      markerSub.textContent = "WITC marker";
      svg.appendChild(markerSub);

      if (count === 0) {
        ringNode.appendChild(svg);
        if (ringText) ringText.textContent = "Add at least two members to form a circle.";
        return;
      }

      var points = [];
      for (var i = 0; i < count; i += 1) {
        var angle = (-Math.PI / 2) + (i * 2 * Math.PI) / count;
        points.push({
          x: cx + radius * Math.cos(angle),
          y: cy + radius * Math.sin(angle),
          witnessed: plan.participants[i].witnessed
        });
      }

      for (var a = 0; a < count; a += 1) {
        var from = points[a];
        var to = points[(a + 1) % count];
        var live = from.witnessed && to.witnessed && structurallyValid;
        if (count === 2 && a === 1) continue;
        var arc = svgEl("path", {
          d:
            "M " + from.x.toFixed(2) + " " + from.y.toFixed(2) +
            " A " + radius + " " + radius + " 0 0 1 " + to.x.toFixed(2) + " " + to.y.toFixed(2),
          class: live ? "d-edge-on" : "d-edge"
        });
        svg.appendChild(arc);
      }

      points.forEach(function (point, index) {
        var spoke = svgEl("line", {
          x1: point.x.toFixed(2),
          y1: point.y.toFixed(2),
          x2: (cx + (point.x - cx) * 0.5).toFixed(2),
          y2: (cy + (point.y - cy) * 0.5).toFixed(2),
          class: point.witnessed && structurallyValid ? "d-edge-on" : "d-edge"
        });
        svg.appendChild(spoke);
        svg.appendChild(
          svgEl("circle", {
            cx: point.x.toFixed(2),
            cy: point.y.toFixed(2),
            r: 17,
            class: point.witnessed && structurallyValid ? "d-node-on" : "d-node"
          })
        );
        var label = svgEl("text", {
          x: point.x.toFixed(2),
          y: (point.y + 4).toFixed(2),
          "text-anchor": "middle",
          class: "d-label"
        });
        label.textContent = String(index);
        svg.appendChild(label);
      });

      ringNode.appendChild(svg);
      if (ringText) {
        ringText.textContent = closed
          ? "Closed. " + count + " members, " + witnessedCount + " signatures, one shared marker."
          : "Open. " + witnessedCount + " of " + count + " members have committed" +
            (structurallyValid ? "." : ", and the transaction grammar is not satisfied.");
      }
    }

    reset(3);
    run();
  }

  /* ================= marker decoder ================= */

  var decoder = document.querySelector("[data-decoder]");
  if (decoder) {
    var decoderInput = decoder.querySelector("textarea");
    var decoderOut = decoder.querySelector("[data-decoder-out]");
    var decode = function () {
      decoderOut.textContent = "";
      var value = decoderInput.value.trim();
      if (value === "") return;
      var marker;
      try {
        marker = W.decodeMarkerScript(W.hexToBytes(value));
      } catch (error) {
        decoderOut.appendChild(
          el("div", { class: "verdict", "data-state": "invalid" }, [
            el("b", {}, ["Rejected"]),
            el("p", {}, [error.code + ". " + error.message])
          ])
        );
        return;
      }
      var list = el("dl", { class: "kv" });
      [
        ["Magic", marker.magic],
        ["Protocol version", String(marker.version)],
        ["Network", marker.network + " (0x0" + marker.networkId + ")"],
        ["Operation", "CIRCLE (0x01)"],
        ["Participants", String(marker.participantCount)],
        ["Context hash", marker.contextHash]
      ].forEach(function (row) {
        var wrap = el("div", {});
        wrap.appendChild(el("dt", {}, [row[0]]));
        wrap.appendChild(el("dd", {}, [row[1]]));
        list.appendChild(wrap);
      });
      decoderOut.appendChild(
        el("div", { class: "verdict", "data-state": "valid" }, [el("b", {}, ["Valid WITC marker"])])
      );
      decoderOut.appendChild(list);
    };
    decoderInput.addEventListener("input", decode);
    decoder.querySelectorAll("[data-decoder-sample]").forEach(function (button) {
      button.addEventListener("click", function () {
        decoderInput.value = button.getAttribute("data-decoder-sample");
        decode();
      });
    });
  }

  /* ================= published vector replay ================= */

  var replay = document.querySelector("[data-replay]");
  if (replay) initReplay(replay);

  function initReplay(rootNode) {
    var log = rootNode.querySelector("[data-replay-log]");
    var stateNode = rootNode.querySelector("[data-replay-state]");
    var runButton = rootNode.querySelector("[data-replay-run]");
    var base = rootNode.getAttribute("data-base") || "";

    function line(ok, label, detail) {
      var node = el("li", { "data-ok": ok === null ? "" : ok ? "true" : "false" });
      node.appendChild(el("b", {}, [label]));
      if (detail) node.appendChild(el("span", { class: "hex" }, [detail]));
      log.appendChild(node);
    }

    function toPrevouts(list) {
      return list.map(function (prevout) {
        return {
          txid: prevout.txid,
          vout: prevout.vout,
          value: BigInt(prevout.valueSats),
          scriptPubKey: W.hexToBytes(prevout.scriptPubKey),
          blockHeight: prevout.blockHeight
        };
      });
    }

    function renderState(snapshot) {
      stateNode.textContent = "";
      var summary = el("dl", { class: "kv" });
      var active = snapshot.lineages.filter(function (lineage) {
        return lineage.status === "active";
      }).length;
      [
        ["Revision", String(snapshot.revision)],
        ["Circles", String(snapshot.circles.length)],
        ["Lineages", snapshot.lineages.length + " (" + active + " active)"],
        ["Shards", String(snapshot.shards.length)],
        ["Continuation edges", String(snapshot.edges.length)]
      ].forEach(function (row) {
        var wrap = el("div", {});
        wrap.appendChild(el("dt", {}, [row[0]]));
        wrap.appendChild(el("dd", {}, [row[1]]));
        summary.appendChild(wrap);
      });
      stateNode.appendChild(summary);

      if (snapshot.lineages.length === 0) return;
      var wrapper = el("div", { class: "scroll-x" });
      var table = el("table");
      var head = el("thead");
      var headRow = el("tr");
      ["Lineage", "Status", "Circles", "Current shard"].forEach(function (label) {
        headRow.appendChild(el("th", { scope: "col" }, [label]));
      });
      head.appendChild(headRow);
      table.appendChild(head);
      var body = el("tbody");
      snapshot.lineages.forEach(function (lineage) {
        var row = el("tr");
        row.appendChild(el("td", { class: "hex" }, [shorten(lineage.lineageId, 10, 6)]));
        row.appendChild(
          el("td", {}, [
            el("span", { class: "pill " + (lineage.status === "active" ? "on" : "off") }, [lineage.status])
          ])
        );
        row.appendChild(el("td", { class: "num" }, [String(lineage.circleCount)]));
        row.appendChild(
          el("td", { class: "hex" }, [
            lineage.currentOutpoint === null ? "closed" : shorten(lineage.currentOutpoint, 12, 4)
          ])
        );
        body.appendChild(row);
      });
      table.appendChild(body);
      wrapper.appendChild(table);
      stateNode.appendChild(wrapper);
    }

    async function replayVectors() {
      log.textContent = "";
      runButton.disabled = true;
      try {
        var responses = await Promise.all([
          fetch(base + "test-vectors/v1/golden-circle.json", { credentials: "omit" }),
          fetch(base + "test-vectors/v1/state-lifecycle.json", { credentials: "omit" }),
          fetch(base + "test-vectors/v1/marker-vectors.json", { credentials: "omit" })
        ]);
        if (responses.some(function (response) { return !response.ok; })) {
          throw new Error("vector files could not be read");
        }
        var golden = await responses[0].json();
        var lifecycle = await responses[1].json();
        var markers = await responses[2].json();

        markers.valid.forEach(function (vector) {
          var marker = W.decodeMarkerScript(W.hexToBytes(vector.script));
          line(
            marker.contextHash === vector.contextHash &&
              marker.participantCount === vector.participants &&
              marker.network === vector.network,
            "Marker vector accepted: " + vector.name,
            vector.script
          );
        });
        markers.invalid.forEach(function (vector) {
          var code = null;
          try {
            W.decodeMarkerScript(W.hexToBytes(vector.script));
          } catch (error) {
            code = error.code;
          }
          line(code === vector.error, "Marker vector rejected: " + vector.name, "expected " + vector.error + ", produced " + code);
        });

        var engine = new W.WitnessStateEngine();
        var emptyHash = await engine.stateHash();
        line(
          emptyHash === lifecycle.rollbackExpectedStateHashes[2],
          "Empty state hash matches the specification",
          emptyHash
        );
        renderState(engine.snapshot());

        var genesis = await W.validateCircle(W.decodeTransaction(golden.rawTransaction), {
          network: golden.network,
          currentBlockHeight: golden.currentBlockHeight,
          prevouts: toPrevouts(golden.prevouts),
          signatureMode: "shape"
        });
        line(genesis.txid === golden.txid, "Golden circle txid reproduced", genesis.txid);
        line(genesis.wtxid === golden.wtxid, "Golden circle wtxid reproduced", genesis.wtxid);
        line(
          genesis.fee.toString() === golden.feeSats && genesis.metrics.virtualBytes === golden.virtualBytes,
          "Fee and virtual size reproduced",
          genesis.fee.toString() + " sats over " + genesis.metrics.virtualBytes + " vB"
        );
        var lineageIds = [];
        for (var i = 0; i < genesis.members.length; i += 1) {
          lineageIds.push(await W.deriveLineageId(genesis.members[i].input));
        }
        line(
          JSON.stringify(lineageIds) === JSON.stringify(golden.expectedLineageIds),
          "Lineage identifiers reproduced",
          lineageIds.map(function (value) { return shorten(value, 10, 4); }).join("  ")
        );

        var first = await engine.apply({
          txid: genesis.txid,
          spentOutpoints: genesis.members.map(function (member) { return member.input; }),
          blockHeight: golden.stateTransition.blockHeight,
          blockHash: golden.stateTransition.blockHash,
          transactionIndex: golden.stateTransition.transactionIndex,
          circle: genesis
        });
        line(
          first.stateHash === golden.stateTransition.expectedStateHash,
          "Transition 1 of 3: genesis circle, three lineages created",
          first.stateHash
        );
        renderState(engine.snapshot());

        var continuation = lifecycle.continuation;
        var second = await W.validateCircle(W.decodeTransaction(continuation.rawTransaction), {
          network: golden.network,
          currentBlockHeight: continuation.currentBlockHeight,
          prevouts: toPrevouts(continuation.prevouts),
          signatureMode: "shape"
        });
        var secondTransition = await engine.apply({
          txid: second.txid,
          spentOutpoints: second.members.map(function (member) { return member.input; }),
          blockHeight: continuation.blockHeight,
          blockHash: continuation.blockHash,
          transactionIndex: continuation.transactionIndex,
          circle: second
        });
        line(
          secondTransition.stateHash === continuation.expectedStateHash &&
            secondTransition.continuedLineages.length === 2,
          "Transition 2 of 3: continuation circle, two lineages advance",
          secondTransition.stateHash
        );
        renderState(engine.snapshot());

        var closure = lifecycle.closure;
        var third = await engine.apply({
          txid: closure.txid,
          spentOutpoints: closure.spentOutpoints,
          blockHeight: closure.blockHeight,
          blockHash: closure.blockHash,
          transactionIndex: closure.transactionIndex,
          circle: null
        });
        line(
          third.stateHash === closure.expectedStateHash && third.kind === "ordinary-spend",
          "Transition 3 of 3: an ordinary spend closes one lineage",
          third.stateHash
        );
        renderState(engine.snapshot());

        var rollbacks = [
          await engine.rollbackLast(closure.txid),
          await engine.rollbackLast(continuation.txid),
          await engine.rollbackLast(golden.txid)
        ];
        line(
          JSON.stringify(rollbacks) === JSON.stringify(lifecycle.rollbackExpectedStateHashes),
          "Reorganization rollback returns every published root",
          rollbacks.map(function (value) { return shorten(value, 10, 4); }).join("  ")
        );
        renderState(engine.snapshot());

        var failures = log.querySelectorAll('[data-ok="false"]').length;
        line(
          failures === 0,
          failures === 0
            ? "Complete. This page reproduces every published vector."
            : failures + " check(s) disagreed with the published vectors.",
          ""
        );
      } catch (error) {
        line(false, "The replay could not run", error && error.message ? error.message : String(error));
      }
      runButton.disabled = false;
    }

    runButton.addEventListener("click", replayVectors);
  }
})();
