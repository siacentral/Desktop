import log from 'electron-log';
import { BigNumber } from 'bignumber.js';

import Store from '@/store';
import { apiClient } from './index';
import { getContracts } from '@/api/siacentral';
import { formatPriceString, formatFriendlyStatus } from '@/utils/formatLegacy';

let confirmedContracts = [];

class Contract {}

class Snapshot {
	constructor(timestamp) {
		this.active_contracts = 0;
		this.expired_contracts = 0;
		this.failed_contracts = 0;
		this.new_contracts = 0;
		this.successful_contracts = 0;
		this.burnt_collateral = new BigNumber(0);
		this.earned_revenue = new BigNumber(0);
		this.payout = new BigNumber(0);
		this.potential_revenue = new BigNumber(0);
		this.timestamp = new Date(timestamp);
	}
}

export function filteredContracts(filter = {}) {
	let length = 0;
	const total = {
		data_size: new BigNumber(0),
		account_funding: new BigNumber(0),
		potential_revenue: new BigNumber(0),
		earned_revenue: new BigNumber(0),
		lost_revenue: new BigNumber(0),
		revenue: new BigNumber(0),
		locked_collateral: new BigNumber(0),
		risked_collateral: new BigNumber(0),
		returned_collateral: new BigNumber(0),
		burnt_collateral: new BigNumber(0),
		download_revenue: new BigNumber(0),
		upload_revenue: new BigNumber(0),
		storage_revenue: new BigNumber(0),
		contract_cost: new BigNumber(0),
		cost_basis: {
			value: new BigNumber(0),
			currency: 'usd'
		},
		payout: new BigNumber(0)
	};
	let contracts = confirmedContracts.reduce((val, c) => {
		let added = false;

		if (filter.start_date && filter.start_date > c.expiration_timestamp)
			return val;

		if (filter.end_date && filter.end_date < c.expiration_timestamp)
			return val;

		if (filter.revenue_min && filter.revenue_min.gt && filter.revenue_min.gt(c.revenue))
			return val;

		if (filter.revenue_max && filter.revenue_max.lt && filter.revenue_max.lt(c.revenue))
			return val;

		if (!added && filter.statuses.indexOf('active') !== -1 && c.status === 'obligationUnresolved') {
			val.push(c);
			added = true;
		}

		if (!added && filter.statuses.indexOf('successful') !== -1 && c.status === 'obligationSucceeded') {
			val.push(c);
			added = true;
		}

		if (!added && filter.statuses.indexOf('failed') !== -1 && c.status === 'obligationFailed') {
			val.push(c);
			added = true;
		}

		if (added) {
			total.data_size = total.data_size.plus(c.data_size);
			total.contract_cost = total.contract_cost.plus(c.contract_cost);
			total.account_funding = total.account_funding.plus(c.account_funding);
			total.potential_revenue = total.potential_revenue.plus(c.potential_revenue);
			total.earned_revenue = total.earned_revenue.plus(c.earned_revenue);
			total.cost_basis.value = total.cost_basis.value.plus(c.earned_revenue.div('1e24').times(c.expiration_exchange_rate.rate));
			total.cost_basis.currency = c.expiration_exchange_rate.currency;
			total.lost_revenue = total.lost_revenue.plus(c.lost_revenue);
			total.revenue = total.revenue.plus(c.revenue);
			total.locked_collateral = total.locked_collateral.plus(c.locked_collateral);
			total.risked_collateral = total.risked_collateral.plus(c.risked_collateral);
			total.returned_collateral = total.returned_collateral.plus(c.returned_collateral);
			total.burnt_collateral = total.burnt_collateral.plus(c.burnt_collateral);
			total.download_revenue = total.download_revenue.plus(c.download_revenue);
			total.upload_revenue = total.upload_revenue.plus(c.upload_revenue);
			total.storage_revenue = total.storage_revenue.plus(c.storage_revenue);
			total.download_revenue = total.download_revenue.plus(c.download_revenue);
			total.payout = total.payout.plus(c.payout);
		}

		return val;
	}, []);

	length = contracts.length;

	if (filter.sort && filter.sort.key) {
		contracts.sort((a, b) => {
			const key = filter.sort.key,
				ac = a,
				bc = b;
			a = a[filter.sort.key];
			b = b[filter.sort.key];

			switch (key) {
			case 'data_size':
			case 'account_funding':
			case 'locked_collateral':
			case 'risked_collateral':
			case 'returned_collateral':
			case 'burnt_collateral':
			case 'contract_cost':
			case 'storage_revenue':
			case 'upload_revenue':
			case 'download_revenue':
			case 'potential_revenue':
			case 'earned_revenue':
			case 'lost_revenue':
			case 'payout':
			case 'revenue': {
				const aNum = new BigNumber(a),
					agtB = aNum.gt(b);

				if (agtB && filter.sort.descending)
					return -1;
				else if (agtB)
					return 1;

				const altB = aNum.lt(b);

				if (altB && filter.sort.descending)
					return 1;
				else if (altB)
					return -1;

				return 0;
			} case 'cost_basis':
				return (() => {
					const aNum = new BigNumber(ac.earned_revenue).div('1e24').times(ac.expiration_exchange_rate.rate),
						bNum = new BigNumber(bc.earned_revenue).div('1e24').times(bc.expiration_exchange_rate.rate),
						agtB = aNum.gt(bNum);

					if (agtB && filter.sort.descending)
						return -1;
					else if (agtB)
						return 1;

					const altB = aNum.lt(bNum);

					if (altB && filter.sort.descending)
						return 1;
					else if (altB)
						return -1;

					return 0;
				})();
			case 'gain_loss':
				return (() => {
					const currentRate = new BigNumber(Store.state.coinPrice[Store.state.config.currency]),
						aRate = new BigNumber(ac.expiration_exchange_rate.rate),
						bRate = new BigNumber(bc.expiration_exchange_rate.rate),
						aPct = currentRate.minus(aRate).div(aRate).times(100),
						bPct = currentRate.minus(bRate).div(bRate).times(100),
						agtB = aPct.gt(bPct),
						altB = aPct.lt(bPct);

					if (agtB && filter.sort.descending)
						return -1;
					else if (agtB)
						return 1;

					if (altB && filter.sort.descending)
						return 1;
					else if (altB)
						return -1;

					return 0;
				})();
			case 'status':
			case 'sia_status':
				a = formatFriendlyStatus(a).toLowerCase();
				b = formatFriendlyStatus(b).toLowerCase();

				if (a > b && filter.sort.descending)
					return -1;
				else if (a > b)
					return 1;

				if (a < b && filter.sort.descending)
					return 1;
				else if (a < b)
					return -1;

				return 0;
			case 'negotiation_timestamp':
			case 'expiration_timestamp':
				if (a > b && filter.sort.descending)
					return -1;
				else if (a > b)
					return 1;

				if (a < b && filter.sort.descending)
					return 1;
				else if (a < b)
					return -1;

				return 0;

			default:
				if (a > b && filter.sort.descending)
					return -1;
				else if (a > b)
					return 1;

				if (a < b && filter.sort.descending)
					return 1;
				else if (a < b)
					return -1;

				return 0;
			}
		});
	}

	if (typeof filter.page === 'number') {
		const perPage = 50;
		let start = filter.page * perPage, end;

		if (start > contracts.length)
			start = 0;

		end = start + 50;
		if (end > contracts.length)
			end = contracts.length;

		contracts = contracts.slice(start, end);
	}

	return { contracts, total, length };
}

export async function refreshHostContracts() {
	try {
		await parseHostContracts();
	} catch (ex) {
		log.error('refreshHostContracts', ex.message);
	}
}

function stdDate(d) {
	const s = new Date(d.toString());

	s.setHours(0, 0, 0, 0);
	s.setDate(1);

	return s.getTime();
}

function mergeContract(chain, sia, stats, snapshots, block) {
	const c = new Contract();

	c.id = chain.id;
	c.transaction_id = chain.transaction_id;
	c.contract_cost = new BigNumber(sia.contractcost);
	c.transaction_fees = new BigNumber(sia.transactionfeesadded);
	c.data_size = new BigNumber(sia.datasize);
	c.account_funding = new BigNumber(sia.potentialaccountfunding);
	c.storage_revenue = new BigNumber(sia.potentialstoragerevenue);
	c.download_revenue = new BigNumber(sia.potentialdownloadrevenue);
	c.upload_revenue = new BigNumber(sia.potentialuploadrevenue);
	c.sector_count = sia.sectorrootscount;
	c.revision_number = sia.revisionnumber;
	c.sia_status = sia.obligationstatus;
	c.status = chain.status;
	c.proof_confirmed = chain.proof_confirmed;
	c.valid_proof_outputs = chain.valid_proof_outputs.map(o => ({ unlock_hash: o.unlock_hash, value: new BigNumber(o.value) }));
	c.missed_proof_outputs = chain.missed_proof_outputs.map(o => ({ unlock_hash: o.unlock_hash, value: new BigNumber(o.value) }));
	c.sia_valid_proof_outputs = sia.validproofoutputs.map(o => ({ unlock_hash: o.unlockhash, value: new BigNumber(o.value) }));
	c.sia_missed_proof_outputs = sia.missedproofoutputs.map(o => ({ unlock_hash: o.unlockhash, value: new BigNumber(o.value) }));
	c.negotiation_height = chain.negotiation_height;
	c.expiration_height = chain.expiration_height;
	c.proof_deadline = chain.proof_deadline;
	c.negotiation_timestamp = new Date(chain.negotiation_timestamp);
	c.expiration_timestamp = new Date(chain.expiration_timestamp);
	c.proof_deadline_timestamp = new Date(chain.proof_deadline_timestamp);
	c.proof_timestamp = new Date(chain.proof_timestamp);
	c.burnt_collateral = new BigNumber(0);
	c.returned_collateral = new BigNumber(0);
	c.risked_collateral = new BigNumber(0);
	c.locked_collateral = new BigNumber(0);
	c.earned_revenue = new BigNumber(0);
	c.lost_revenue = new BigNumber(0);
	c.potential_revenue = new BigNumber(0);
	c.renewed = false;
	c.proof_required = !c.valid_proof_outputs[1].value.eq(c.missed_proof_outputs[1].value);
	c.payout_height = 0;
	c.expiration_exchange_rate = {
		rate: new BigNumber(chain.expiration_exchange_rate.rate),
		currency: chain.expiration_exchange_rate.currency
	};
	c.tags = [];

	// check for cleared contract
	// Javascript VM rounds the revision number to 18446744073709552000
	if (new BigNumber(chain.revision_number).gte('18446744073709551615') && chain.valid_proof_outputs.length === chain.missed_proof_outputs.length)
		c.renewed = true;

	stats.total++;

	const startStamp = stdDate(c.negotiation_timestamp),
		expireStamp = stdDate(c.expiration_timestamp);

	if (snapshots[startStamp])
		snapshots[startStamp].new_contracts++;

	if (snapshots[expireStamp])
		snapshots[expireStamp].expired_contracts++;

	for (let i = startStamp; i < expireStamp;) {
		const next = new Date(i);

		next.setMonth(next.getMonth() + 1, 1);

		if (snapshots[i])
			snapshots[i].active_contracts++;

		i = stdDate(next);
	}

	if (c.proof_confirmed)
		c.payout_height = chain.proof_height + 144;
	else
		c.payout_height = chain.expiration_height + 144;

	c.payout_blocks = c.payout_height - block.height;
	if (c.payout_blocks < 0)
		c.payout_blocks = 0;

	switch (c.status.toLowerCase()) {
	case 'obligationsucceeded': {
		if (c.proof_confirmed)
			c.payout = c.valid_proof_outputs[1].value;
		else
			c.payout = c.missed_proof_outputs[1].value;

		c.returned_collateral = new BigNumber(sia.lockedcollateral);
		c.revenue = c.payout.minus(sia.lockedcollateral);
		c.earned_revenue = c.revenue;

		stats.successful++;
		stats.earnedRevenue = stats.earnedRevenue.plus(c.revenue);

		let successStamp;

		if (c.proof_confirmed)
			successStamp = stdDate(c.proof_timestamp);
		else
			successStamp = stdDate(c.proof_deadline_timestamp);

		if (snapshots[successStamp]) {
			snapshots[successStamp].successful_contracts++;
			snapshots[successStamp].earned_revenue = snapshots[successStamp].earned_revenue.plus(c.revenue);
			snapshots[successStamp].payout = snapshots[successStamp].payout.plus(c.payout);
			snapshots[successStamp].active_contracts--;
		}

		if (snapshots[expireStamp])
			snapshots[expireStamp].expired_contracts--;

		break;
	} case 'obligationfailed': {
		c.payout = new BigNumber(c.missed_proof_outputs[1].value);
		c.revenue = c.missed_proof_outputs[1].value.minus(sia.lockedcollateral);
		c.earned_revenue = c.revenue;

		if (c.missed_proof_outputs[1].value.lt(sia.lockedcollateral)) {
			c.burnt_collateral = new BigNumber(sia.lockedcollateral).minus(c.missed_proof_outputs[1].value);
			c.lost_revenue = c.valid_proof_outputs[1].value.minus(sia.lockedcollateral);
			c.returned_collateral = new BigNumber(c.missed_proof_outputs[1].value);
		} else {
			c.returned_collateral = new BigNumber(sia.lockedcollateral);
			c.lost_revenue = c.valid_proof_outputs[1].value.minus(c.missed_proof_outputs[1].value);
		}

		stats.failed++;
		stats.lostRevenue = stats.lostRevenue.plus(c.lost_revenue);
		stats.earnedRevenue = stats.earnedRevenue.plus(c.revenue);
		stats.burntCollateral = stats.burntCollateral.plus(c.burnt_collateral);

		const failStamp = stdDate(c.proof_deadline_timestamp);

		if (snapshots[failStamp]) {
			snapshots[failStamp].expired_contracts++;
			snapshots[failStamp].failed_contracts++;
			snapshots[failStamp].earned_revenue = snapshots[failStamp].earned_revenue.plus(c.revenue);
			snapshots[failStamp].active_contracts--;
			snapshots[failStamp].expired_contracts--;
		}

		if (snapshots[expireStamp])
			snapshots[expireStamp].expired_contracts--;

		break;
	} default:
		c.locked_collateral = new BigNumber(sia.lockedcollateral);
		c.potential_revenue = c.sia_valid_proof_outputs[1].value.minus(sia.lockedcollateral);
		c.revenue = c.potential_revenue;
		c.payout = new BigNumber(0);

		if (c.sia_missed_proof_outputs[1].value.lt(sia.lockedcollateral))
			c.risked_collateral = new BigNumber(sia.lockedcollateral).minus(c.sia_missed_proof_outputs[1].value);

		if (!c.proof_required)
			stats.unused++;

		stats.active++;
		stats.potentialRevenue = stats.potentialRevenue.plus(c.potential_revenue);
		stats.lockedCollateral = stats.lockedCollateral.plus(c.locked_collateral);
		stats.riskedCollateral = stats.riskedCollateral.plus(c.risked_collateral);

		if (snapshots[expireStamp]) {
			snapshots[expireStamp].potential_revenue = snapshots[expireStamp].potential_revenue.plus(c.potential_revenue);
			snapshots[expireStamp].active_contracts--;
		}
	}

	return c;
}

async function parseHostContracts() {
	const stats = {
			total: 0,
			active: 0,
			failed: 0,
			successful: 0,
			potentialRevenue: new BigNumber(0),
			earnedRevenue: new BigNumber(0),
			lostRevenue: new BigNumber(0),
			riskedCollateral: new BigNumber(0),
			lockedCollateral: new BigNumber(0),
			burntCollateral: new BigNumber(0)
		},
		snapshots = {};

	const endDate = new Date(),
		startDate = new Date();

	endDate.setMonth(endDate.getMonth() + 4, 1);
	startDate.setMonth(endDate.getMonth() - 16, 1);

	for (let i = stdDate(startDate); i < stdDate(endDate);) {
		const next = new Date(i);

		next.setMonth(next.getMonth() + 1, 1);

		snapshots[i] = new Snapshot(i);

		i = stdDate(next);
	}

	try {
		const currentBlock = await apiClient.getLastBlock(),
			alerts = [],
			siaContracts = await apiClient.getHostContracts(),
			contractMap = {};
		let pendingPayout = new BigNumber(0);

		currentBlock.timestamp = new Date(currentBlock.timestamp * 1000);

		if (!Array.isArray(siaContracts.contracts))
			siaContracts.contracts = [];

		for (let i = 0; i < siaContracts.contracts.length; i++)
			contractMap[siaContracts.contracts[i].obligationid] = siaContracts.contracts[i];

		let confirmed = await getContracts(Object.keys(contractMap), Store.state.config.currency);
		if (!Array.isArray(confirmed))
			confirmed = [];

		for (let i = 0; i < confirmed.length; i++) {
			const contract = confirmed[i],
				c = mergeContract(contract, contractMap[contract.id], stats, snapshots, currentBlock);

			if (c.proof_deadline < currentBlock.height && c.proof_required && !c.proof_confirmed) {
				c.tags.push({
					severity: 'severe',
					text: 'Proof Not Submitted'
				});
			}

			if ((c.status === 'obligationSucceeded' || c.status === 'obligationFailed') && c.payout_height > currentBlock.height)
				pendingPayout = pendingPayout.plus(c.payout);

			confirmed[i] = c;
		}

		if (stats.failed > 0) {
			let prefix;

			if (stats.failed === 1)
				prefix = `${stats.failed} contract has`;
			else
				prefix = `${stats.failed} contracts have`;

			alerts.push({
				id: `${prefix}_failed_contracts`,
				severity: 'danger',
				category: 'contracts',
				message: `${prefix} failed resulting in ${formatPriceString(stats.lostRevenue)} lost revenue and ${formatPriceString(stats.burntCollateral)} burnt collateral. Check the contracts page and your logs for more details`,
				icon: 'file-contract'
			});
		}

		Store.dispatch('hostContracts/setPendingPayouts', pendingPayout);
		Store.dispatch('hostContracts/setStats', stats);
		Store.dispatch('hostContracts/setSnapshots', snapshots);
		// deep copy here
		Store.dispatch('hostContracts/setAlerts', alerts);
		confirmedContracts = confirmed;
	} catch (ex) {
		console.error(ex);
		log.error('parseHostContracts', ex);
	}
}