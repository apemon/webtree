import { WEBTREE_ABI, getContract } from "@/constants/contracts";
import { usePlayer } from "@/stores/usePlayer";
import {
  BarretenbergBackend,
  ProofData,
} from "@noir-lang/backend_barretenberg";
import { Noir } from "@noir-lang/noir_js";
import { buildBabyjub, buildMimc7 } from "circomlibjs";
import _ from "lodash";
import { useCallback, useEffect, useState } from "react";
import { Hex, fromHex, toHex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { useChainId, useContractReads } from "wagmi";

export const useProver = () => {
  const [isProving, setIsProving] = useState(false);
  const [proof, setProof] = useState<
    | (ProofData & {
        stats: {
          c0: {
            x: Hex;
            y: Hex;
          };
          c1: {
            x: Hex;
            y: Hex;
          };
        }[];
      })
    | null
  >(null);

  const { key } = usePlayer();
  const chainId = useChainId();
  const contract = getContract(chainId);
  const { data, isLoading } = useContractReads({
    contracts: [
      {
        address: contract,
        abi: WEBTREE_ABI,
        functionName: "epochTime",
      },
      {
        address: contract,
        abi: WEBTREE_ABI,
        functionName: "worldPublicKey",
      },
    ],
  });

  const [seed, setSeed] = useState<Hex | null>(null);
  useEffect(() => {
    const g = async () => {
      if (!key || !data?.[0].result) return;
      const mimc = await buildMimc7();
      const hash = mimc.multiHash([key?.raw, toHex(data[0].result)]);
      setSeed(toHex(hash));
    };
    g();
  }, [data?.[0]?.result, key?.raw]);

  const prove = useCallback(
    async (choices: boolean[]) => {
      try {
        setIsProving(true);
        console.log("proving");
        const circuit = await import("../../public/circuits/choice.json");
        const backend = new BarretenbergBackend(circuit as any);
        const noir = new Noir(circuit as any, backend);
        const babyjubjub = await buildBabyjub();
        const elgamal_randomness = _.range(4).map(() =>
          toHex(fromHex(generatePrivateKey(), "bigint") % babyjubjub.order)
        );
        if (!key || !data || !data[1].result || !data[0].result) return;
        console.log("executing return data");
        console.log(choices);
        console.log(toHex(key.publicKey.x));
        console.log(toHex(key.publicKey.y));
        const witness = {
          elgamal_pk: {
            x: toHex(key.publicKey.x),
            y: toHex(key.publicKey.y),
          },
          global_elgamal_pk: {
            x: toHex(data[1].result.x),
            y: toHex(data[1].result.y),
          },
          elgamal_randomness,
          public_seed: toHex(data[0].result),
          public_commitment: key.commitment,
          preimage: key.raw,
          private_choices: choices.map((choice) => (choice ? 0 : 1)),
          private_key: key.raw,
        };
        const result = await noir.execute(witness);
        console.log("result", result);
        const now = _.now();
        const proof = await noir.generateFinalProof(witness);
        console.log("elapsed", (_.now() - now) / 1000, "s");
        setProof({
          ...proof,
          stats: (result.returnValue as any[]).map((e) => {
            return {
              c0: {
                x: e[0].x,
                y: e[0].y,
              },
              c1: {
                x: e[1].x,
                y: e[1].y,
              },
            };
          }),
        });
        console.log(proof);
      } catch (e) {
        throw e;
      } finally {
        setIsProving(false);
      }
    },
    [data, key]
  );

  const reset = () => {
    setProof(null);
  };

  return {
    isProving,
    proof,
    prove,
    isLoading,
    epochSeed: data?.[0]?.result,
    seed,
    reset,
  };
};
