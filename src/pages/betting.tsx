import { Fragment, useState, useEffect } from 'react';
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ConfirmOptions,
  LAMPORTS_PER_SOL,
  SystemProgram,
  SYSVAR_RENT_PUBKEY
} from '@solana/web3.js'
import {AccountLayout,MintLayout,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,Token, NATIVE_MINT} from "@solana/spl-token";
import useNotify from './notify'
import * as anchor from "@project-serum/anchor";

let wallet : any
let conn = new Connection("https://solana-mainnet.phantom.tech")
let notify: any

const programId = new PublicKey('f1ip66vevC2TVtJ4CBkjGp2ghEv3uczYbLLHFHg8Qrz')
// const pool = new PublicKey('6iFRbunJyjbM8ERujHsQRiY4ehkmAr9mV8MMYdAHE3Zo')
const idl = require('./betting.json')
const confirmOption : ConfirmOptions = {commitment : 'finalized',preflightCommitment : 'finalized',skipPreflight : false}

export default function Betting(){
	wallet = useWallet()
	notify = useNotify()

	const [bettingToken, setBettingToken] = useState('invSTFnhB1779dyku9vKSmGPxeBNKhdf7ZfGL1vTH3u')
	const [feeReceiver, setFeeReceiver] = useState('')
	const [feeTokenReceiver, setFeeTokenReceiver] = useState('')
	const [feeAmount, setFeeAmount] = useState('')
	const [redeemAmount, setRedeemAmount] = useState('')
	const [depositAmount, setDepositAmount] = useState('')
	const [newAuthority, setNewAuthority] = useState('')

	const [newPool, setNewPool] = useState('')
	const [curPool, setCurPool] = useState('B97oTaJMWFLvbGe1dfbLawYZQN4LA19CC4yKY2pPbQN6')

	const [poolData, setPoolData] = useState<any>(null)
	const [pAmount, setPAmount] = useState(0)

	const createAssociatedTokenAccountInstruction = (
	  associatedTokenAddress: anchor.web3.PublicKey,
	  payer: anchor.web3.PublicKey,
	  walletAddress: anchor.web3.PublicKey,
	  splTokenMintAddress: anchor.web3.PublicKey
	  ) => {
	  const keys = [
	    { pubkey: payer, isSigner: true, isWritable: true },
	    { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
	    { pubkey: walletAddress, isSigner: false, isWritable: false },
	    { pubkey: splTokenMintAddress, isSigner: false, isWritable: false },
	    {
	      pubkey: anchor.web3.SystemProgram.programId,
	      isSigner: false,
	      isWritable: false,
	    },
	    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
	    {
	      pubkey: SYSVAR_RENT_PUBKEY,
	      isSigner: false,
	      isWritable: false,
	    },
	  ];
	  return new TransactionInstruction({
	    keys,
	    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
	    data: Buffer.from([]),
	  });
	}
	const getTokenWallet = async (owner: PublicKey,mint: PublicKey) => {
	  return (
	    await PublicKey.findProgramAddress(
	      [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
	      ASSOCIATED_TOKEN_PROGRAM_ID
	    )
	  )[0];
	}
	async function getDecimalsOfToken(mint : PublicKey){
	  let resp = await conn.getAccountInfo(mint)
	  let accountData = MintLayout.decode(Buffer.from(resp!.data))
	  return accountData.decimals
	}

	useEffect(()=>{
		getPoolData()
	},[curPool])

	useEffect(()=>{
		if(poolData!=null)
			getTokenAmount(poolData)
	},[poolData,wallet.publicKey])

	const getTokenAmount = async (pD : any) =>{
		try{
			let amount = 0
			if(wallet!=null && wallet.publicKey!=null){
		  	// const tokenAccount = await getTokenWallet(wallet.publicKey, pD.tokenMint)
		  	amount = ((await conn.getTokenAccountBalance(pD.tokenAccount)).value as any).uiAmount
		  }
		  setPAmount(amount)
		}catch(err){
			setPAmount(0)
		}
	}

	const getPoolData = async() => {
		try{
			const randWallet = new anchor.Wallet(Keypair.generate())
    	const provider = new anchor.Provider(conn,randWallet,confirmOption)
    	const program = new anchor.Program(idl,programId,provider)
    	const pool = new PublicKey(curPool)
    	const pD = await program.account.pool.fetch(pool)

    	setPoolData(pD)
		} catch(err){
			console.log(err)
			setPoolData(null)
		}
	}

	const initPool = async() => {
		try{
			const provider = new anchor.Provider(conn, wallet as any, confirmOption)
	  	const program = new anchor.Program(idl,programId,provider)
	  	let transaction = new Transaction()		
	    const rand = Keypair.generate().publicKey;
		  const [pool, bump] = await PublicKey.findProgramAddress([rand.toBuffer()],programId)
		  const tokenMint = new PublicKey(bettingToken)
		  const tokenAccount = await getTokenWallet(pool, tokenMint)
		  transaction.add(createAssociatedTokenAccountInstruction(tokenAccount,wallet.publicKey,pool,tokenMint))
		  const feeTokenReceiverPubkey = new PublicKey(feeTokenReceiver)
		  const accountRentExempt = await conn.getMinimumBalanceForRentExemption(AccountLayout.span)
		  if((await conn.getAccountInfo(feeTokenReceiverPubkey))==null){
		  	if(bettingToken===NATIVE_MINT.toBase58())
		  		transaction.add(SystemProgram.transfer({
		          fromPubkey : wallet.publicKey,
		          toPubkey : feeTokenReceiverPubkey,
		          lamports : 3 * accountRentExempt
		      }))
		    transaction.add(createAssociatedTokenAccountInstruction(feeTokenReceiverPubkey, wallet.publicKey, new PublicKey(feeReceiver),tokenMint))
		  }
		  transaction.add(program.instruction.initPool(
		      new anchor.BN(bump),
		      new anchor.BN(Number(feeAmount) * 100),
		      false,
		      {
		          accounts : {
		              owner : wallet.publicKey,
		              pool : pool,
		              rand : rand,
		              tokenMint : tokenMint,
		              tokenAccount : tokenAccount,
		              feeReceiver : feeTokenReceiverPubkey,
		              systemProgram : SystemProgram.programId
		          }
		      }
		  ))
		  await sendTransaction(transaction, [])
	  	notify('success', 'Success!')
	  	setNewPool(pool.toBase58())	
		} catch(err) {
			console.log(err)
			notify('error','Failed Instruction!')
		}
	}

	const updatePool = async() => {
		try{
			const provider = new anchor.Provider(conn, wallet as any, confirmOption)
	  	const program = new anchor.Program(idl,programId,provider)
	  	let transaction = new Transaction()
	  	let pool = new PublicKey(curPool)
	  	const tokenMint = new PublicKey(bettingToken)
	  	const feeTokenReceiverPubkey = new PublicKey(feeTokenReceiver)
	  	const accountRentExempt = await conn.getMinimumBalanceForRentExemption(AccountLayout.span)
		  if((await conn.getAccountInfo(feeTokenReceiverPubkey))==null){
		  	if(bettingToken===NATIVE_MINT.toBase58())
		  		transaction.add(SystemProgram.transfer({
		          fromPubkey : wallet.publicKey,
		          toPubkey : feeTokenReceiverPubkey,
		          lamports : 3 * accountRentExempt
		      }))
			  	transaction.add(createAssociatedTokenAccountInstruction(feeTokenReceiverPubkey, wallet.publicKey, new PublicKey(feeReceiver), tokenMint))
		  }
	  	transaction.add(program.instruction.updatePool(new anchor.BN(Number(feeAmount) * 100),{
	  		accounts:{
	  			owner : wallet.publicKey,
	  			pool : pool,
	  			feeReceiver : feeTokenReceiverPubkey
	  		}
	  	}))
			await sendTransaction(transaction, [])
	  	notify('success', 'Success!')
		} catch(err){
			console.log(err)
			notify('error','Failed Instruction!')
		}
	}

	const updateInvoker = async(status : boolean) => {
		try{
			const provider = new anchor.Provider(conn, wallet as any, confirmOption)
	  	const program = new anchor.Program(idl,programId,provider)
	  	let transaction = new Transaction()
	  	let pool = new PublicKey(curPool)
	  	transaction.add(program.instruction.updateInvokerState(status,{
	  		accounts:{
	  			owner : wallet.publicKey,
	  			pool : pool
	  		}
	  	}))
			await sendTransaction(transaction, [])
	  	notify('success', 'Success!')
		} catch(err){
			console.log(err)
			notify('error','Failed Instruction!')
		}
	}

	const deposit = async() => {
		try{
			let transaction = new Transaction()
			let tempAccount = await getTokenWallet(wallet.publicKey, poolData.tokenMint)
			const accountRentExempt = await conn.getMinimumBalanceForRentExemption(AccountLayout.span)
			let amount = Number(depositAmount) * LAMPORTS_PER_SOL
			// if(await conn.getAccountInfo(tempAccount)){
			// 	transaction.add(SystemProgram.transfer({
	  //         fromPubkey : wallet.publicKey,
	  //         toPubkey : tempAccount,
	  //         lamports : 3 * accountRentExempt
	  //     }))
	  //     transaction.add(Token.createCloseAccountInstruction(TOKEN_PROGRAM_ID,tempAccount,wallet.publicKey,wallet.publicKey,[]))
			// }
			if(poolData.tokenMint.toBase58()===NATIVE_MINT.toBase58())
	      transaction.add(SystemProgram.transfer({
	          fromPubkey : wallet.publicKey,
	          toPubkey : tempAccount,
	          lamports : amount + 3 * accountRentExempt
	      }))
	    if((await conn.getAccountInfo(tempAccount))==null)
	      transaction.add(createAssociatedTokenAccountInstruction(tempAccount, wallet.publicKey,wallet.publicKey,poolData.tokenMint))
    	transaction.add(Token.createTransferInstruction(TOKEN_PROGRAM_ID, tempAccount, poolData.tokenAccount, wallet.publicKey,[],amount))
    	if(poolData.tokenMint.toBase58()===NATIVE_MINT.toBase58())
    		transaction.add(Token.createCloseAccountInstruction(TOKEN_PROGRAM_ID,tempAccount,wallet.publicKey,wallet.publicKey,[]))
			
			await sendTransaction(transaction, [])
	  	notify('success', 'Success!')
		} catch(err){
			console.log(err)
			notify('error','Failed Instruction!')
		}
	}

	const redeem = async() => {
		try{
			let provider = new anchor.Provider(conn, wallet as any, confirmOption)
	  	let program = new anchor.Program(idl,programId,provider)
	  	let transaction = new Transaction()
	  	const pool = new PublicKey(curPool)
	  	let amount = Number(redeemAmount) * Math.pow(10, poolData.decimals)
	  	let tempAccount = await getTokenWallet(wallet.publicKey, poolData.tokenMint)
	  	const accountRentExempt = await conn.getMinimumBalanceForRentExemption(AccountLayout.span)
	  	if(poolData.tokenMint.toBase58()===NATIVE_MINT.toBase58())
		  	transaction.add(SystemProgram.transfer({
	          fromPubkey : wallet.publicKey,
	          toPubkey : tempAccount,
	          lamports : 3 * accountRentExempt
	      }))
		  if((await conn.getAccountInfo(tempAccount))==null)
      	transaction.add(createAssociatedTokenAccountInstruction(tempAccount, wallet.publicKey,wallet.publicKey,poolData.tokenMint))

	  	transaction.add(program.instruction.redeemToken(new anchor.BN(amount),{
	  		accounts : {
		  		owner : wallet.publicKey,
		  		pool : pool,
		  		tokenFrom : poolData.tokenAccount,
		  		tokenTo : tempAccount,
		  		tokenProgram : TOKEN_PROGRAM_ID,
		  	}
	  	}))
	  	if(poolData.tokenMint.toBase58()===NATIVE_MINT.toBase58())
	  		transaction.add(Token.createCloseAccountInstruction(TOKEN_PROGRAM_ID,tempAccount,wallet.publicKey,wallet.publicKey,[]))
	  	await sendTransaction(transaction, [])
	  	notify('success', 'Success!')
		} catch(err) {
			console.log(err)
			notify('error', 'Failed Instruction!')
		}
	}

	const setOwner = async() => {
		try{
			let provider = new anchor.Provider(conn, wallet as any, confirmOption)
	  	let program = new anchor.Program(idl,programId,provider)
	  	let transaction = new Transaction()
	  	const pool = new PublicKey(curPool)
			transaction.add(program.instruction.setAuthority(new PublicKey(newAuthority),{
				accounts:{
					owner : wallet.publicKey,
					pool : pool
				}
			}))
	  	await sendTransaction(transaction, [])
	  	notify('success', 'Success!')
		} catch(err) {
			console.log(err)
			notify('error', 'Failed Instruction!')
		}
	}

	async function sendTransaction(transaction : Transaction, signers : Keypair[]) {
		transaction.feePayer = wallet.publicKey
		transaction.recentBlockhash = (await conn.getRecentBlockhash('max')).blockhash;
		await transaction.setSigners(wallet.publicKey,...signers.map(s => s.publicKey));
		if(signers.length !== 0) await transaction.partialSign(...signers)
		const signedTransaction = await wallet.signTransaction(transaction);
		let hash = await conn.sendRawTransaction(await signedTransaction.serialize());
		await conn.confirmTransaction(hash);
		return hash
	}

	return <div className="container-fluid mt-4 row">
		<div className="col-lg-6">
			<h4>Betting POOL</h4>
			
			<div className="input-group mb-3">
        <span className="input-group-text">Betting Token</span>
        <input name="bettingToken"  type="text" className="form-control" onChange={(event)=>{setBettingToken(event.target.value)}} value={bettingToken}/>
      </div>
      
      <div className="input-group mb-3">
        <span className="input-group-text">Fee Receiver</span>
        <input name="feeReceiver"  type="text" className="form-control" onChange={async (event)=>{
        	setFeeReceiver(event.target.value)
        	try{
        		setFeeTokenReceiver((await getTokenWallet(new PublicKey(event.target.value), new PublicKey(bettingToken))).toBase58())
        	}catch(err){
        		console.log(err)
        	}
        }} value={feeReceiver}/>
      </div>
      
      <div className="input-group mb-3">
        <span className="input-group-text">Fee Token Receiver</span>
        <input name="feeTokenReceiver"  type="text" className="form-control" onChange={(event)=>{setFeeTokenReceiver(event.target.value)}} value={feeTokenReceiver}/>
      </div>

      <div className="input-group mb-3">
        <span className="input-group-text">Fee Amount</span>
        <input name="feeAmount"  type="text" className="form-control" onChange={(event)=>{setFeeAmount(event.target.value)}} value={feeAmount}/>
      	<span className="input-group-text">%</span>
      </div>
      {
				wallet && wallet.connected && 
				<div className="row container-fluid mb-3">
					<button type="button" className="btn btn-primary mb3" onClick={async ()=>{
						await initPool()
					}}>Create POOL</button>
				</div>
			}
			<h6>{newPool}</h6>
		</div>
		<div className="col-lg-6">
			<h4>Current Pool</h4>
			<h5>INV POOL : B97oTaJMWFLvbGe1dfbLawYZQN4LA19CC4yKY2pPbQN6</h5>
			<h5>SOL POOL : 7VsxSGfCd5jWRzyADcDsvZAhVLDEeXzxXMdF6Y61Hodk</h5>
			<div className="input-group mb-3">
        <span className="input-group-text">Pool</span>
        <input name="curPool"  type="text" className="form-control" onChange={(event)=>{setCurPool(event.target.value)}} value={curPool}/>
      </div>
			<div className="input-group mb-3">
       	<span className="input-group-text">New Authority</span>
    		<input name="newAuthority"  type="text" className="form-control" onChange={(event)=>{
    			setNewAuthority(event.target.value)
    		}} value={newAuthority}/>
	      {
	      	wallet && wallet.connected &&
	      	<button type="button" disabled={poolData == null} className="btn btn-success" onClick={async ()=>{
	      		await setOwner()
	      		await getPoolData()
	      	}}>Set</button>
	      }
      </div>
			<h6>{"Pool has " + pAmount + (poolData==null || poolData.tokenMint.toBase58()==NATIVE_MINT.toBase58() ? " SOL" : " IV")}</h6>
				<div className="input-group mb-3">
	       	<span className="input-group-text">Deposit</span>
	    		<input name="depositAmount"  type="text" className="form-control" onChange={(event)=>{
	    			setDepositAmount(event.target.value)
	    		}} value={depositAmount}/>
		      {
		      	wallet && wallet.connected &&
		      	<button type="button" disabled={poolData == null} className="btn btn-success" onClick={async ()=>{
		      		await deposit()
		      		await getPoolData()
		      	}}>Deposit</button>
		      }
	      </div>	

	      <div className="input-group mb-5">
	       	<span className="input-group-text">Redeem</span>
	    		<input name="redeemAmount"  type="text" className="form-control" onChange={(event)=>{
	    			setRedeemAmount(event.target.value)
	    		}} value={redeemAmount}/>
		      {
		      	wallet && wallet.connected &&
		      	<button type="button" disabled={poolData == null} className="btn btn-success" onClick={async ()=>{
		      		await redeem()
		      		await getPoolData()
		      	}}>Redeem</button>
		      }
	      </div>		

			{
      	poolData != null &&
      	<>
		    	<h5>Pool Data</h5>
		    	<p>{"Owner : "+ poolData.owner.toBase58()}</p>
		    	<p>{"Token : "+ poolData.tokenMint.toBase58()}</p>
		    	<p>{"Token Account : "+poolData.tokenAccount.toBase58()}</p>
		    	<p>{"Fee Receiver : "+poolData.feeReceiver.toBase58()}</p>
		    	<p>{"Fee : " + poolData.fee/100 + "%"}</p>
		    	<p>{"Invoking state : " + (poolData.isInvoker ? "True" : "False")}</p>
      	</>
      }
			{
				wallet && wallet.connected && 
				<div className="row container-fluid mb-3">
					<button type="button" className="btn btn-primary mb3" onClick={async ()=>{
						await updatePool()
						await getPoolData()
					}}>Update Fee and Fee Receiver</button>
				</div>
			}
			{
				wallet && wallet.connected && 
				<div className="row container-fluid">
					<div className="col-lg-6 row">
						<button type="button" className="btn btn-success mb3" onClick={async ()=>{
							await updateInvoker(true)
							await getPoolData()
						}}>Invoker : True</button>
					</div>
					<div className="col-lg-6 row">
						<button type="button" className="btn btn-danger mb3" onClick={async ()=>{
							await updateInvoker(false)
							await getPoolData()
						}}>Invoker : False</button>
					</div>
				</div>
			}
		</div>
	</div>
}