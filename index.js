import { AuthorizationCode } from 'simple-oauth2';
import open from 'open';
import Express from 'express';
import axios from "axios";

const app = Express();
const port = '3000';

const baseUrl = 'https://api.bitbucket.org/2.0/repositories/develux-trial-day';

app.listen(port, (err) => {
    if (err) {
        return console.error(err)
    }
});

const authorize = async (packageName, packageVersion, repositoryName, branchName) => {
    const config = {
        client: {
            id: '6gd7kzaUQRUDJATX2z',
            secret: 'D6Db4cRmptngNWChB9QdQJnD5QXJzubu'
        },
        auth: {
            tokenHost: 'https://bitbucket.org',
            tokenPath: '/site/oauth2/access_token',
            authorizePath: '/site/oauth2/authorize',
        }
    };

    const client = new AuthorizationCode(config);

    const authorizationUri = client.authorizeURL();

    app.get('/auth', (req, res) => {
        res.redirect(authorizationUri);
    });

    app.get('/callback', async (req, res) => {
        const { code } = req.query;

        try {
            const accessToken = await client.getToken({ code });
            const packageJson = await getPackageJson(repositoryName);
            const updatedPackage = updatePackage(packageJson, packageName, packageVersion);

            await createBranch(accessToken.token, repositoryName, branchName);
            await commitChanges(accessToken.token, repositoryName, branchName, updatedPackage);
            await createPullRequest(accessToken.token, repositoryName, branchName);
        } catch (error) {
            console.error('Access Token Error', error.message);
        }
    });
}

const getPackageJson = async (repositoryName) => {
    const url = `${baseUrl}/${repositoryName}/src/main/package.json`;
    return await axios.get(url).then(res => res.data);
};

const updatePackage = (packageJson, packageName, packageVersion) => {
    return {
        ...packageJson,
        name: packageName,
        version: packageVersion
    }
}

const createBranch = async (accessToken, repositoryName, branchName) => {
    const url = `${baseUrl}/${repositoryName}/refs/branches`;
    await axios.post(
        url,
        {
            name: branchName,
            target: {
                hash: 'main'
            }
        },
        {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken.access_token}`
            }
        }
    ).catch(err => console.log(err.response));
};

const commitChanges = async (accessToken, repositoryName, branchName, updatedPackage) => {
    const url = `${baseUrl}/${repositoryName}/src`;
    await axios.post(
        url,
        {
            message: 'commit created by script',
            parents: ['refs/head/main'],
            branch: branchName,
            'package.json': JSON.stringify(updatedPackage)
        },
        {
            headers: {
                'Content-Type': 'multipart/form-data',
                Authorization: `Bearer ${accessToken.access_token}`
            }
        }
    ).catch(err => console.log(err.response));
};

const createPullRequest = async (accessToken, repositoryName, branchName) => {
    const url = `${baseUrl}/${repositoryName}/pullrequests`;
    await axios.post(
        url,
        {
            title: 'New pull request created by script',
            source: {
                branch: {
                    name: branchName
                }
            },
            destination: {
                branch: {
                    name: 'main'
                }
            }
        },
        {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken.access_token}`
            }
        }
    ).catch(err => console.log(err.response));
};

(async () => {
    const [ packageName, packageVersion, repositoryName, branchName ] = process.argv.slice(2);
    try {
        await authorize(packageName, packageVersion, repositoryName, branchName);
        await open(`http://localhost:3000/auth`);
    } catch (e) {
        console.error(e);
    }
})();
