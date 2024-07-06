import { Injectable } from '@nestjs/common';
import { Contract, Interface, JsonRpcProvider, Wallet } from 'ethers';
import { IcoContract } from './libs/contract';
import { icoAbi } from './libs/abi/icoAbi';
import { config } from 'dotenv';

config();

@Injectable()
export class EthersService {
  public provider = new JsonRpcProvider(
    'https://bsc-testnet-rpc.publicnode.com',
  );

  private readonly signer = new Wallet(process.env.PRIVATE_KEY, this.provider);

  public icoContract = new Contract(IcoContract, icoAbi, this.provider);
  public signedIcoContract = new Contract(IcoContract, icoAbi, this.signer);

  public icoInterface = new Interface(icoAbi);
}
