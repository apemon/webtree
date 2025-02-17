import { STATS } from "@/constants/stats";
import { seedToChoices } from "@/utils/seed";
import {
  Box,
  Button,
  Card,
  Circle,
  HStack,
  Heading,
  Icon,
  IconButton,
  Stack,
  Text,
  useToast,
} from "@chakra-ui/react";
import _ from "lodash";
import Lottie from "react-lottie-player";
import { useCallback, useEffect, useState } from "react";
import { Stat, statByIndex } from "@/interfaces/stats";
import {
  useAccount,
  useChainId,
  useContractRead,
  useContractWrite,
  usePrepareContractWrite,
} from "wagmi";
import { Story } from "@/interfaces/story";
import { useQuery } from "@tanstack/react-query";
import { FaX } from "react-icons/fa6";
import { useProver } from "@/hooks/useProver";
import { SwipableCard } from "./SwipableCard";
import { Facts } from "./Facts";
import { WEBTREE_ABI, getContract } from "@/constants/contracts";
import { toHex } from "viem";
import { useTransactionToast } from "@/hooks/useTransactionToast";
import { usePlayer } from "@/stores/usePlayer";

export const Game = ({ toggleQuery }: { toggleQuery: () => void }) => {
  const chainId = useChainId();
  const toast = useToast({
    position: "top",
    duration: 5000,
    render: ({ title, description, id, onClose }) => (
      <Card as={Stack} key={id} maxW="xl">
        <HStack justify="space-between">
          <Heading fontSize="lg">{title}</Heading>
          <IconButton
            icon={<Icon as={FaX} />}
            aria-label="close"
            onClick={onClose}
            variant="outline"
            size="xs"
          />
        </HStack>
        <Text>{description}</Text>
      </Card>
    ),
  });

  const { player } = usePlayer();
  const { seed, prove, isProving, proof, reset: resetProof } = useProver();
  const { data: cards, isLoading } = useQuery<
    (Story & ReturnType<typeof seedToChoices>[number])[]
  >({
    queryKey: ["choices", seed],
    queryFn: async () => {
      if (!seed) return [];
      const response = await fetch(
        `/api/choice?seed=${seed}&chainId=${chainId}`,
        {
          cache: "force-cache",
        }
      );
      const result: Story[] = await response.json();
      const choices = seedToChoices(seed);
      return result.map((story, i) => ({
        ...story,
        ...choices[i],
      }));
    },
    cacheTime: 100000,
  });

  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [stats, setStats] = useState(_.mapValues(STATS, (v) => v.default));

  const reset = () => {
    setChoices([]);
    setCurrentCardIndex(0);
    resetProof();
  };

  const [choices, setChoices] = useState<boolean[]>([]);
  const onSwipe = useCallback(
    (isYes: boolean) => {
      if (cards) {
        const card = cards[currentCardIndex];
        const newStats = { ...stats };
        card.stats.forEach((value, statIndex) => {
          newStats[statByIndex(statIndex)] += value * (isYes ? 1 : -1);
        });
        setStats(newStats);
        setSwiped(isYes);
        setChoices((c) => [...c, isYes]);
        toast.closeAll();
        toast({
          title: card.title,
          description: isYes ? card.yes : card.no,
        });
        setTimeout(() => {
          setSwiped(null);
          setCurrentCardIndex((i) => i + 1);
        }, 1000);
      }
    },
    [cards, currentCardIndex]
  );
  const [swiped, setSwiped] = useState<boolean | null>(null);

  useEffect(() => {
    if (currentCardIndex >= 5 && !proof && !isProving) {
      prove(choices);
    }
  }, [proof, currentCardIndex, isProving]);

  const { data: epoch } = useContractRead({
    address: getContract(chainId),
    abi: WEBTREE_ABI,
    functionName: "epoch",
    staleTime: 15000,
  });

  const { address } = useAccount();
  const txToast = useTransactionToast();
  const { config } = usePrepareContractWrite({
    address: getContract(chainId),
    abi: WEBTREE_ABI,
    account: address,
    functionName: "action",
    args: proof ? [proof.stats, toHex(proof.proof)] : undefined,
  });
  const { writeAsync, isLoading: isSubmitting } = useContractWrite({
    ...config,
    onError: (error) => {
      txToast.errorMessage(error.message);
    },
    onSettled: async (tx) => {
      if (tx?.hash) {
        txToast.submitted(tx.hash);
        await txToast.waitForTransactionReceipt(tx.hash);
        toggleQuery();
      }
    },
  });

  return (
    <>
      <HStack>
        {_.entries(STATS).map(([key, stat], i) => {
          const percent = _.clamp(
            (stats[key as Stat] * 50) / stat.default,
            0,
            100
          );
          const current = cards?.[currentCardIndex]?.stats?.[i] ?? 0;
          return (
            <Stack key={key} align="center">
              <Stack h="100px" justify="end" pos="relative">
                <Box
                  rounded="full"
                  bg="chakra-body-text"
                  w="8px"
                  h="100%"
                  pos="absolute"
                  opacity={0.2}
                />
                <Box
                  rounded="full"
                  bg="chakra-body-text"
                  w="8px"
                  h={`${percent}%`}
                  transition="all 0.3s ease-in-out"
                />
              </Stack>
              <Box boxSize="48px">
                <Lottie path={stat.lottie} speed={0.3} loop play />
              </Box>
              <Text textAlign="center" as="b">
                {stat.name}
              </Text>
              {cards && currentCardIndex < cards.length && (
                <Circle
                  size="12px"
                  bg={
                    swiped !== null
                      ? current > 0
                        ? swiped
                          ? "green.400"
                          : "red.400"
                        : current < 0
                        ? swiped
                          ? "red.400"
                          : "green.400"
                        : "chakra-body-text"
                      : "chakra-body-text"
                  }
                  opacity={
                    cards[currentCardIndex].minus.includes(key as Stat) ||
                    cards[currentCardIndex].plus.includes(key as Stat)
                      ? 1
                      : 0
                  }
                  transition="all 0.3s ease-in-out"
                />
              )}
            </Stack>
          );
        })}
      </HStack>
      <Stack minH="400px" pos="relative" justify="center">
        {!cards || isLoading ? (
          <Stack align="center">
            <Box boxSize="64px">
              <Lottie path="/icons/search.json" loop play />
            </Box>
            <Text align="center">
              As the morning unfolds, there's a vibe in the air. Big decisions
              on the horizon, my friend. Get ready for some action!
            </Text>
          </Stack>
        ) : (
          <>
            <Text>
              {currentCardIndex < cards.length && (
                <>
                  {currentCardIndex + 1} / {cards.length}
                </>
              )}
            </Text>
            <Stack pos="relative" h="400px" align="center">
              {currentCardIndex < cards.length ? (
                <>
                  <Heading
                    pos="absolute"
                    left="200px"
                    top="50%"
                    transform="translateY(-100%)"
                  >
                    Yes
                  </Heading>
                  <Heading
                    pos="absolute"
                    right="200px"
                    top="50%"
                    transform="translateY(-100%)"
                  >
                    No
                  </Heading>
                  {_.reverse(cards).map((card, _i) => {
                    const i = cards.length - _i - 1;
                    return (
                      <SwipableCard
                        key={`${seed}${i}`}
                        card={card}
                        onSwipe={onSwipe}
                        pointerEvents={i === currentCardIndex ? "auto" : "none"}
                        zIndex={i}
                      />
                    );
                  })}
                </>
              ) : (
                <Stack h="100%" justify="center" align="center">
                  {isProving && (
                    <>
                      <Box boxSize="32px">
                        <Lottie path="/icons/target.json" loop play />
                      </Box>
                      <Heading fontSize={{ base: "md", md: "lg" }}>
                        Generating Zero Knowledge Proof
                      </Heading>
                      <Facts />
                    </>
                  )}
                  {proof &&
                    player &&
                    epoch &&
                    player.lastActionEpoch < epoch && (
                      <>
                        <Box boxSize="32px">
                          <Lottie path="/icons/target.json" loop play />
                        </Box>
                        <Heading fontSize={{ base: "md", md: "lg" }}>
                          Submit your choices to the world
                        </Heading>
                        <Text>
                          By submitting, your choices will forever be recorded
                          on the world engraving.
                        </Text>
                        <Button
                          isLoading={isSubmitting || txToast.isWaiting}
                          onClick={() => writeAsync && writeAsync()}
                        >
                          Submit
                        </Button>
                      </>
                    )}
                </Stack>
              )}
            </Stack>
          </>
        )}
      </Stack>
    </>
  );
};
