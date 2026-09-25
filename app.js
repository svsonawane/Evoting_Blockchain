const CONTRACT_ABI = [
  "function admin() view returns (address)",
  "function votingOpen() view returns (bool)",
  "function candidatesCount() view returns (uint256)",
  "function hasVoted(address) view returns (bool)",
  "function addCandidate(string _name)",
  "function vote(uint256 _candidateId)",
  "function setVotingOpen(bool _open)",
  "function getAllCandidates() view returns (tuple(uint256 id, string name, uint256 voteCount)[])",
  "event VoteCast(address indexed voter, uint256 indexed candidateId)"
];

const SEPOLIA_CHAIN_ID = 11155111n;
const HARDCODED_CONTRACT_ADDRESS = "0x69EAf28d05c8d967CC0457F660ec2FDCbF05c03A";

let provider, signer, contract, userAddress, contractAddress;

const $ = (id) => document.getElementById(id);

$('connectBtn').addEventListener('click', connectWallet);

async function connectWallet() {
  if (!window.ethereum) {
    alert('MetaMask not found. Please install the MetaMask extension.');
    return;
  }
  provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  signer = await provider.getSigner();
  userAddress = await signer.getAddress();

  const network = await provider.getNetwork();
  const onSepolia = network.chainId === SEPOLIA_CHAIN_ID;

  $('networkStatus').textContent = onSepolia
    ? `Connected: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`
    : `Wrong network (switch MetaMask to Sepolia)`;
  $('networkStatus').className = onSepolia ? 'pill pill-good' : 'pill pill-bad';
  $('connectBtn').textContent = 'Connected';

  contractAddress = HARDCODED_CONTRACT_ADDRESS;
  await loadContract();
}

$('loadContractBtn').addEventListener('click', async () => {
  contractAddress = $('contractAddress').value.trim();
  if (!ethers.isAddress(contractAddress)) {
    alert('That does not look like a valid contract address.');
    return;
  }
  if (!signer) await connectWallet();
  await loadContract();
});

async function loadContract() {
  contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);

  const admin = await contract.admin();
  const isAdmin = admin.toLowerCase() === userAddress.toLowerCase();
  $('adminSection').classList.toggle('hidden', !isAdmin);

  await refreshVotingStatus();
  await refreshCandidates();

  $('candidatesSection').classList.remove('hidden');

  contract.on('VoteCast', () => refreshCandidates());
}

async function refreshVotingStatus() {
  const open = await contract.votingOpen();
  $('votingStatus').textContent = open ? 'Voting open' : 'Voting closed';
  $('votingStatus').className = open ? 'pill pill-good' : 'pill pill-bad';
  $('toggleVotingBtn').textContent = open ? 'Close voting' : 'Reopen voting';
}

$('addCandidateBtn').addEventListener('click', async () => {
  const name = $('candidateName').value.trim();
  if (!name) return;
  try {
    const tx = await contract.addCandidate(name);
    $('addCandidateBtn').disabled = true;
    await tx.wait();
    $('candidateName').value = '';
    await refreshCandidates();
  } catch (err) {
    alert(parseError(err));
  } finally {
    $('addCandidateBtn').disabled = false;
  }
});

$('toggleVotingBtn').addEventListener('click', async () => {
  try {
    const open = await contract.votingOpen();
    const tx = await contract.setVotingOpen(!open);
    await tx.wait();
    await refreshVotingStatus();
  } catch (err) {
    alert(parseError(err));
  }
});

async function refreshCandidates() {
  const list = await contract.getAllCandidates();
  const voted = await contract.hasVoted(userAddress);
  const votingOpen = await contract.votingOpen();

  const ul = $('candidateList');
  ul.innerHTML = '';

  if (list.length === 0) {
    ul.innerHTML = '<li>No candidates added yet.</li>';
    return;
  }

  list.forEach((c) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="candidate-info">
        <span class="candidate-name"></span>
        <span class="candidate-votes">${c.voteCount.toString()} vote(s)</span>
      </div>
      <button class="vote-btn" data-id="${c.id}" ${voted || !votingOpen ? 'disabled' : ''}>
        ${voted ? 'Voted' : 'Vote'}
      </button>
    `;
    li.querySelector('.candidate-name').textContent = c.name;
    ul.appendChild(li);
  });

  ul.querySelectorAll('.vote-btn').forEach((btn) => {
    btn.addEventListener('click', () => castVote(btn.dataset.id, btn));
  });

  $('voteMessage').textContent = voted ? 'Your vote has already been recorded on-chain.' : '';
}

async function castVote(candidateId, btn) {
  try {
    btn.disabled = true;
    btn.textContent = 'Confirm in wallet...';
    const tx = await contract.vote(candidateId);
    btn.textContent = 'Mining...';
    await tx.wait();
    $('voteMessage').textContent = 'Vote recorded! Transaction confirmed on Sepolia.';
    await refreshCandidates();
  } catch (err) {
    alert(parseError(err));
    await refreshCandidates();
  }
}

function parseError(err) {
  return err?.reason || err?.shortMessage || err?.message || 'Transaction failed';
}
