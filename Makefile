# Offline pipeline. Every target reads only from samples/ and the repo; none touches the network.
SHELL := /bin/bash
.PHONY: reproduce verify-samples deobf disasm trace figures paper test clean

reproduce: verify-samples deobf disasm trace figures

# Check every pinned bundle in samples/ against data/bundles.csv (columns: platform,filename,url,sha256,date_captured).
verify-samples:
	@tail -n +2 data/bundles.csv | while IFS=, read -r platform file url sha date; do \
	  [ -z "$$file" ] && continue; \
	  if [ ! -f "samples/$$file" ]; then echo "MISSING  samples/$$file"; exit 1; fi; \
	  got=$$(shasum -a 256 "samples/$$file" | cut -d' ' -f1); \
	  if [ "$$got" != "$$sha" ]; then echo "MISMATCH samples/$$file"; exit 1; fi; \
	  echo "OK       samples/$$file"; \
	done

# Run the deobfuscation pass tests, then apply the string-array pass to the pinned bundle.
deobf:
	cd tools/deobf && node --test
	node tools/deobf/run.js samples/webmssdk.1.0.0.417.js

# Decode the bytecode, build the opcode table, and run recursive-descent disassembly.
disasm:
	cd tools/vm && node --test
	NODE_PATH=tools/deobf/node_modules node tools/vm/pipeline.js

# Runtime trace in the Node harness (logging browser shim + VM hooks).
trace:
	NODE_PATH=tools/deobf/node_modules node tools/harness/run_tiktok.js

figures:
	@echo "figures: not implemented yet"

paper:
	cd paper && latexmk -pdf main.tex

test:
	@echo "tests: none yet"

clean:
	cd paper && latexmk -C || true
