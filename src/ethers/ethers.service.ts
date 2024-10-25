import { Injectable } from '@nestjs/common';
import { Contract, Interface, JsonRpcProvider, Wallet } from 'ethers';
import {
  BuyContract,
  IcoContract,
  binancePaymentContractAddress,
  StakingContract,
  oldReferalContract,
  newReferalContract,
  Fit24BuyTokenIco,
  oldFit24BuyTokenIco,
  blokfitVestingContract,
} from './libs/contract';
import { icoAbi } from './libs/abi/icoAbi';
import { config } from 'dotenv';
import stakingAbi from './libs/abi/stakingAbi';
import { paymentAbi } from './libs/abi/paymentAbi';
import { buyAbi } from './libs/abi/buyAbi';
import { oldStakingAbi } from './libs/abi/oldStakingAbi';
import { referralAbi } from './libs/abi/referralAbi';
import { oldPaymentAbi } from './libs/abi/oldPaymentAbi';
import { fit24TokenIcoBuyAbi } from './libs/abi/fit24TokenIcoBuyAbi';
import { oldFit24TokenIcoBuyAbi } from './libs/abi/olfFit24TokenIcoBuyAbi';
import { blokfitVestingAbi } from './libs/abi/blokfitVestingAbi';

config();
@Injectable()
export class EthersService {
  // public binanceProvider = new JsonRpcProvider(
  //   'https://bsc-testnet-rpc.publicnode.com',
  // );
  // public ethereumProvider = new JsonRpcProvider(
  //   'https://bsc-testnet-rpc.publicnode.com',
  // );
  public binanceProvider = new JsonRpcProvider(
    process.env.BINANCE_RPC_PROVIDER,
  );

  public ethereumProvider = new JsonRpcProvider(
    process.env.ETHEREUM_RPC_PROVIDER,
  );
  public blokfitProvider = new JsonRpcProvider(
    process.env.BLOKFIT_RPC_PROVIDER,
  );
  public oldBlokfitProvider = new JsonRpcProvider('https://bfit.rpc.zeeve.net');
  // public blokfitProvider = new JsonRpcProvider(
  //   'https://bsc-testnet-rpc.publicnode.com',
  // );

  // private readonly signer = new Wallet(
  //   process.env.PRIVATE_KEY,
  //   this.binanceProvider,
  // );
  private readonly signer = new Wallet(
    process.env.PRIVATE_KEY,
    this.blokfitProvider,
  );

  public icoContract = new Contract(
    StakingContract,
    stakingAbi,
    this.blokfitProvider,
  );

  public oldReferralContract = new Contract(
    oldReferalContract,
    referralAbi,
    this.blokfitProvider,
  );
  public newReferralContract = new Contract(
    newReferalContract,
    referralAbi,
    this.blokfitProvider,
  );
  // public newReferralContract = new Contract(
  //   newReferalContract,
  //   referralAbi,
  //   this.binanceProvider,
  // );
  public newReferralSignedContract = new Contract(
    newReferalContract,
    referralAbi,
    this.signer,
  );

  // public oldStakingContract = new Contract(
  //   OldStakingContract,
  //   oldStakingAbi,
  //   this.blokfitProvider,
  // );

  public signedBlokfitVestingContract = new Contract(
    blokfitVestingContract,
    blokfitVestingAbi,
    this.signer,
  );
  public signedIcoContract = new Contract(
    StakingContract,
    stakingAbi,
    this.signer,
  );
  public signedBuyIcoContract = new Contract(BuyContract, buyAbi, this.signer);
  public signedFit24TokenIcoBuyIcoContract = new Contract(
    Fit24BuyTokenIco,
    fit24TokenIcoBuyAbi,
    this.signer,
  );

  public paymentContract = new Contract(
    binancePaymentContractAddress,
    paymentAbi,
    this.binanceProvider,
  );
  public buyContract = new Contract(BuyContract, buyAbi, this.blokfitProvider);
  public fit24TokenIcoBuyContract = new Contract(
    Fit24BuyTokenIco,
    fit24TokenIcoBuyAbi,
    this.blokfitProvider,
  );
  public oldFit24TokenIcoBuyContract = new Contract(
    oldFit24BuyTokenIco,
    oldFit24TokenIcoBuyAbi,
    this.oldBlokfitProvider,
  );

  public icoInterface = new Interface(icoAbi);

  public stakingInterface = new Interface(stakingAbi);

  public buyInterface = new Interface(buyAbi);
  public fit24TokenIcoBuyInterface = new Interface(fit24TokenIcoBuyAbi);
  public oldFit24TokenIcoBuyInterface = new Interface(oldFit24TokenIcoBuyAbi);

  public paymentInterface = new Interface(paymentAbi);
  public oldPaymentInterface = new Interface(oldPaymentAbi);

  public binanceStakingContract = new Contract(
    StakingContract,
    stakingAbi,
    this.binanceProvider,
  );
}
