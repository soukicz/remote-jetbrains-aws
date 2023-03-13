import {EC2Client, DescribeInstanceTypesCommand} from "@aws-sdk/client-ec2";
import {GetProductsCommand, PricingClient} from "@aws-sdk/client-pricing";

const cache = {}

export async function GetInstancePrices(region) {
    if (!cache[region]) {
        cache[region] = await load(region)
    }

    return cache[region]
}

async function load(region) {
    const ec2Client = new EC2Client({
        region: region
    });

    const pricingClient = new PricingClient({
        region: "us-east-1",
    });

    const regionCodes = {
        'us-east-2': 'US East (Ohio)',
        'us-east-1': 'US East (N. Virginia)',
        'us-west-1': 'US West (N. California)',
        'us-west-2': 'US West (Oregon)',
        'af-south-1': 'Africa (Cape Town)',
        'ap-east-1': 'Asia Pacific (Hong Kong)',
        'ap-south-2': 'Asia Pacific (Hyderabad)',
        'ap-southeast-3': 'Asia Pacific (Jakarta)',
        'ap-southeast-4': 'Asia Pacific (Melbourne)',
        'ap-south-1': 'Asia Pacific (Mumbai)',
        'ap-northeast-3': 'Asia Pacific (Osaka)',
        'ap-northeast-2': 'Asia Pacific (Seoul)',
        'ap-southeast-1': 'Asia Pacific (Singapore)',
        'ap-southeast-2': 'Asia Pacific (Sydney)',
        'ap-northeast-1': 'Asia Pacific (Tokyo)',
        'ca-central-1': 'Canada (Central)',
        'eu-central-1': 'EU (Frankfurt)',
        'eu-west-1': 'EU (Ireland)',
        'eu-west-2': 'EU (London)',
        'eu-south-1': 'EU (Milan)',
        'eu-west-3': 'EU (Paris)',
        'eu-south-2': 'EU (Spain)',
        'eu-north-1': 'EU (Stockholm)',
        'eu-central-2': 'EU (Zurich)',
        'me-south-1': 'Middle East (Bahrain)',
        'me-central-1': 'Middle East (UAE)',
        'sa-east-1': 'South America (São Paulo)',
        'us-gov-east-1': 'AWS GovCloud (US-East)',
        'us-gov-west-1': 'AWS GovCloud (US-West)'
    };

    const instanceTypesData = []
    let typesNextToken = null
    do {
        const typesResponse = await ec2Client.send(new DescribeInstanceTypesCommand({
            MaxResults: 100,
            NextToken: typesNextToken
        }))
        for (const type of typesResponse.InstanceTypes) {
            instanceTypesData.push(type)
        }
        typesNextToken = typesResponse.NextToken
    } while (typesNextToken)

    const instanceList = {}
    const filteredInstanceTypes = instanceTypesData
        .filter(type => {
            const classLetter = type.InstanceType.substr(0, 1)
            if (['c', 'r', 'm'].indexOf(classLetter) < 0) {
                return false
            }
            if (type.BurstablePerformanceSupported) {
                return false
            }
            if (type.MemoryInfo.SizeInMiB < 8 * 1024) {
                return false
            }
            if (type.MemoryInfo.SizeInMiB > 80 * 1024) {
                return false
            }
            if (type.VCpuInfo.DefaultVCpus < 4) {
                return false
            }
            if (type.Hypervisor !== 'nitro') {
                return false
            }
            if (type.ProcessorInfo.SupportedArchitectures.indexOf('x86_64') < 0) {
                return false
            }
            return true
        });

    for (const type of filteredInstanceTypes) {
        instanceList[type.InstanceType] = {
            vcpu: type.VCpuInfo.DefaultVCpus, memory: type.MemoryInfo.SizeInMiB
        }
    }

    const instanceTypes = filteredInstanceTypes.map((type) => type.InstanceType);

    for (const instanceType of instanceTypes) {
        const pricingData = await pricingClient.send(new GetProductsCommand({
            ServiceCode: "AmazonEC2", Filters: [{
                Type: 'TERM_MATCH', Field: "location", Value: regionCodes[region],
            }, {
                Type: 'TERM_MATCH', Field: "instanceType", Value: instanceType
            }, {
                'Type': 'TERM_MATCH', 'Field': 'capacitystatus', 'Value': 'Used'
            }, {
                'Type': 'TERM_MATCH', 'Field': 'tenancy', 'Value': 'Shared'
            }, {
                'Type': 'TERM_MATCH', 'Field': 'preInstalledSw', 'Value': 'NA'
            }, {
                'Type': 'TERM_MATCH', 'Field': 'operatingSystem', 'Value': 'Linux'
            }],
        }))

        pricingData.PriceList.forEach((price) => {
            const product = JSON.parse(price);

            const instanceType = product.product.attributes.instanceType;
            instanceList[instanceType].price = parseFloat(Object.values(Object.values(product.terms.OnDemand)[0].priceDimensions)[0].pricePerUnit.USD);

        });
    }

    let index = Object.keys(instanceList).sort(function (a, b) {
        const aParts = a.split('.')
        const bParts = b.split('.')
        if (!aParts[1].match(/^[0-9]/)) {
            aParts[1] = '0' + aParts[1]
        }
        if (!bParts[1].match(/^[0-9]/)) {
            bParts[1] = '0' + bParts[1]
        }
        if (aParts[0] === bParts[0]) {
            return aParts[1].localeCompare(bParts[1], undefined, {numeric: true, sensitivity: 'base'})
        }
        return aParts[0].localeCompare(bParts[0], undefined, {numeric: true, sensitivity: 'base'})

    })

    const sortedInstances = {}
    index.forEach((key) => {
        sortedInstances[key] = instanceList[key]
    })

    return sortedInstances
}